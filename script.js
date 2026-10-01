let xmlDocGlobal = null;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("category-container");
    container.innerHTML = "<p style='color: #ffa726;'>Cargando categorías...</p>";

    const urlParams = new URLSearchParams(window.location.search);
    const lat = parseFloat(urlParams.get("lat")) || 40.4168;
    const lon = parseFloat(urlParams.get("lon")) || -3.7038;

    document.getElementById("info-coords").innerText = `Centro: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;

    const radiusSlider = document.getElementById("search-radius");
    const radiusValueSpan = document.getElementById("radius-value");
    radiusSlider.addEventListener("input", (e) => {
        radiusValueSpan.innerText = e.target.value;
    });

    const toggleExpandAll = document.getElementById("toggle-expand-all");
    if (toggleExpandAll) {
        toggleExpandAll.addEventListener("change", (e) => {
            const groups = document.querySelectorAll(".category-group");
            groups.forEach(group => {
                if (e.target.checked) {
                    group.classList.add("active");
                } else {
                    group.classList.remove("active");
                }
            });
        });
    }

    const selectLang = document.getElementById("select-lang");
    if (selectLang) {
        selectLang.addEventListener("change", () => {
            if (xmlDocGlobal) {
                renderizarCategorias(xmlDocGlobal);
            }
        });
    }

    try {
        const response = await fetch("./poi-mapping-overpass-turbo.xml");
        if (!response.ok) {
            throw new Error(`No se encuentra el XML (Error HTTP: ${response.status})`);
        }
        
        const text = await response.text();
        xmlDocGlobal = new DOMParser().parseFromString(text, "text/xml");
        
        const parserError = xmlDocGlobal.querySelector("parsererror");
        if (parserError) {
            throw new Error("El archivo XML tiene errores de sintaxis.");
        }

        renderizarCategorias(xmlDocGlobal);
    } catch (error) {
        console.error("Error al cargar el XML:", error);
        container.innerHTML = `<p style='color: #ff5252;'>${error.message}</p>`;
    }

    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
        btnSearch.addEventListener("click", () => {
            if (!xmlDocGlobal) {
                alert("El archivo XML aún no se ha cargado correctamente.");
                return;
            }
            ejecutarConsultaOverpass(lat, lon);
        });
    }
});

function obtenerTraduccion(element, fallback) {
    const selectLang = document.getElementById("select-lang");
    const lang = selectLang ? selectLang.value : "es";

    if (lang === "en") {
        return element.getAttribute("title") || fallback;
    }

    const trans = element.querySelector(`translation[lang='${lang}']`);
    if (trans && trans.textContent.trim()) {
        return trans.textContent.trim();
    }
    
    const transEs = element.querySelector("translation[lang='es']");
    if (transEs && transEs.textContent.trim()) {
        return transEs.textContent.trim();
    }

    return element.getAttribute("title") || fallback;
}

function renderizarCategorias(xmlDoc) {
    const container = document.getElementById("category-container");
    container.innerHTML = "";
    
    const rootCategories = xmlDoc.querySelectorAll(":scope > category, poi_categories > category");
    
    if (rootCategories.length === 0) {
        container.innerHTML = "<p style='color: #ff5252;'>No se encontraron categorías principales en el XML.</p>";
        return;
    }

    rootCategories.forEach((cat) => {
        const catTitle = cat.getAttribute("title") || "Categoría";
        const catName = obtenerTraduccion(cat, catTitle);

        const groupDiv = document.createElement("div");
        groupDiv.className = "category-group";

        const headerDiv = document.createElement("div");
        headerDiv.className = "category-header";
        headerDiv.innerHTML = `<span>${catName}</span> <span class="arrow">▼</span>`;
        
        headerDiv.addEventListener("click", () => {
            groupDiv.classList.toggle("active");
        });

        const itemsDiv = document.createElement("div");
        itemsDiv.className = "category-items";

        const procesarSubcategorias = (parentElem) => {
            const subCategories = parentElem.querySelectorAll(":scope > category");
            subCategories.forEach((sub) => {
                const subTitle = sub.getAttribute("title") || "";
                const subName = obtenerTraduccion(sub, subTitle);

                procesarSubcategorias(sub);

                const mappings = sub.querySelectorAll(":scope > mapping");
                mappings.forEach((map) => {
                    const tagAttr = map.getAttribute("tag");
                    if (!tagAttr) return;

                    const [tagKey, tagValue] = tagAttr.split("=");

                    const label = document.createElement("label");
                    // Mostramos solo el nombre limpio sin las etiquetas OSM entre paréntesis
                    label.innerHTML = `
                        <input type="checkbox" class="subcat-checkbox" data-key="${tagKey}" data-value="${tagValue}">
                        <span>${subName}</span>
                    `;
                    itemsDiv.appendChild(label);
                });
            });
        };

        procesarSubcategorias(cat);

        const directMappings = cat.querySelectorAll(":scope > mapping");
        directMappings.forEach((map) => {
            const tagAttr = map.getAttribute("tag");
            if (!tagAttr) return;
            const [tagKey, tagValue] = tagAttr.split("=");

            const label = document.createElement("label");
            label.innerHTML = `
                <input type="checkbox" class="subcat-checkbox" data-key="${tagKey}" data-value="${tagValue}">
                <span>${catName}</span>
            `;
            itemsDiv.appendChild(label);
        });

        groupDiv.appendChild(headerDiv);
        groupDiv.appendChild(itemsDiv);
        container.appendChild(groupDiv);
    });
}

async function ejecutarConsultaOverpass(lat, lon) {
    const radiusKm = parseInt(document.getElementById("search-radius").value, 10);
    const radiusMeters = radiusKm * 1000;
    const maxResults = parseInt(document.getElementById("max-results").value, 10) || 3000;

    const checkboxes = document.querySelectorAll(".subcat-checkbox:checked");
    if (checkboxes.length === 0) {
        alert("Por favor, selecciona al menos una categoría o elemento.");
        return;
    }

    let queries = [];
    checkboxes.forEach(chk => {
        const key = chk.getAttribute("data-key");
        const value = chk.getAttribute("data-value");
        queries.push(`node(around:${radiusMeters}, ${lat}, ${lon})["${key}"="${value}"];`);
    });

    const overpassQuery = `
        [out:json][timeout:25];
        (
            ${queries.join("\n")}
        );
        out body ${maxResults};
        >;
        out skel qt;
    `;

    try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: overpassQuery
        });
        const data = await res.json();
        generarKMLAgrupado(data);
    } catch (e) {
        console.error("Error en Overpass API:", e);
        alert("Ocurrió un error al conectar con la API de Overpass.");
    }
}

function generarKMLAgrupado(data) {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>PDI - OruxMaps</name>\n`;
    kml += `<Folder><name>Resultados de Búsqueda</name>\n`;
    
    if (data.elements) {
        data.elements.forEach(el => {
            if (el.type === "node" && el.lat && el.lon) {
                const name = el.tags && el.tags.name ? el.tags.name : "Punto sin nombre";
                kml += `
                    <Placemark>
                        <name>${name}</name>
                        <Point><coordinates>${el.lon},${el.lat},0</coordinates></Point>
                    </Placemark>`;
            }
        });
    }
    
    kml += `</Folder>\n</Document>\n</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oruxmaps_pois.kml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
