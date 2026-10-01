let xmlDocGlobal = null;

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("category-container");
    container.innerHTML = "<p style='color: #ffa726; padding: 15px;'>Cargando categorías...</p>";

    const urlParams = new URLSearchParams(window.location.search);
    const lat = parseFloat(urlParams.get("lat")) || 40.4168;
    const lon = parseFloat(urlParams.get("lon")) || -3.7038;

    // Mostrar coordenadas formateadas
    document.getElementById("info-coords").innerText = `Centro: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;

    // Control del Slider de radio y cálculo de superficie en tiempo real
    const radiusSlider = document.getElementById("search-radius");
    const radiusValueSpan = document.getElementById("radius-value");
    const infoArea = document.getElementById("info-area");

    function actualizarCalculosRadio(r) {
        radiusValueSpan.innerText = r;
        const superficie = Math.PI * Math.pow(r, 2);
        infoArea.innerText = `Superficie del área: ${superficie.toFixed(1)} km²`;
    }

    // Inicializar con el valor por defecto del slider
    actualizarCalculosRadio(radiusSlider.value);

    radiusSlider.addEventListener("input", (e) => {
        actualizarCalculosRadio(e.target.value);
    });

    // Control del interruptor general "Expandir nodos"
    const toggleExpandAll = document.getElementById("toggle-expand-all");
    if (toggleExpandAll) {
        toggleExpandAll.addEventListener("change", (e) => {
            const nodes = document.querySelectorAll(".category-node");
            nodes.forEach(node => {
                if (e.target.checked) {
                    node.classList.add("active");
                } else {
                    node.classList.remove("active");
                }
            });
        });
    }

    // Selector de idioma
    const selectLang = document.getElementById("select-lang");
    if (selectLang) {
        selectLang.addEventListener("change", () => {
            if (xmlDocGlobal) {
                renderizarArbolCategorias(xmlDocGlobal);
            }
        });
    }

    // Botón de limpiar selecciones (✕)
    const btnClear = document.getElementById("btn-clear");
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll("input[type='checkbox']");
            checkboxes.forEach(chk => chk.checked = false);
            if (toggleExpandAll) toggleExpandAll.checked = false;
        });
    }

    // Cargar archivo XML de categorías
    try {
        const response = await fetch("./poi-mapping-overpass-turbo.xml");
        if (!response.ok) {
            throw new Error(`No se encuentra el archivo XML (Error HTTP: ${response.status})`);
        }
        
        const text = await response.text();
        xmlDocGlobal = new DOMParser().parseFromString(text, "text/xml");
        
        const parserError = xmlDocGlobal.querySelector("parsererror");
        if (parserError) {
            throw new Error("El archivo XML tiene errores de sintaxis.");
        }

        renderizarArbolCategorias(xmlDocGlobal);
    } catch (error) {
        console.error("Error al cargar el XML:", error);
        container.innerHTML = `<p style='color: #ff5252; padding: 15px;'>${error.message}</p>`;
    }

    // Botón de búsqueda (✓) en la barra superior
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

function construirNodoXML(categoryElem) {
    const titleAttr = categoryElem.getAttribute("title") || "Categoría";
    const name = obtenerTraduccion(categoryElem, titleAttr);

    const nodeDiv = document.createElement("div");
    nodeDiv.className = "category-node";

    const rowDiv = document.createElement("div");
    rowDiv.className = "category-row";

    const subCategories = categoryElem.querySelectorAll(":scope > category");
    const mappings = categoryElem.querySelectorAll(":scope > mapping");
    const hasChildren = subCategories.length > 0 || mappings.length > 0;

    rowDiv.innerHTML = `
        <div class="category-left">
            <input type="checkbox" class="cat-checkbox">
            <span>${name}</span>
        </div>
        <div class="category-arrow">${hasChildren ? '›' : ''}</div>
    `;

    const checkbox = rowDiv.querySelector("input[type='checkbox']");
    const childrenDiv = document.createElement("div");
    childrenDiv.className = "category-children";

    if (hasChildren) {
        rowDiv.addEventListener("click", (e) => {
            if (e.target === checkbox) return;
            nodeDiv.classList.toggle("active");
        });

        subCategories.forEach(sub => {
            childrenDiv.appendChild(construirNodoXML(sub));
        });

        mappings.forEach(map => {
            const tagAttr = map.getAttribute("tag");
            if (!tagAttr) return;
            const [tagKey, tagValue] = tagAttr.split("=");

            const mapRow = document.createElement("div");
            mapRow.className = "category-row";
            mapRow.innerHTML = `
                <div class="category-left">
                    <input type="checkbox" class="subcat-checkbox" data-key="${tagKey}" data-value="${tagValue}">
                    <span>${name}</span>
                </div>
            `;
            childrenDiv.appendChild(mapRow);
        });
    }

    nodeDiv.appendChild(rowDiv);
    if (hasChildren) {
        nodeDiv.appendChild(childrenDiv);
    }

    checkbox.addEventListener("change", () => {
        const descendantChecks = nodeDiv.querySelectorAll("input[type='checkbox']");
        descendantChecks.forEach(ch => {
            ch.checked = checkbox.checked;
        });
    });

    return nodeDiv;
}

function renderizarArbolCategorias(xmlDoc) {
    const container = document.getElementById("category-container");
    container.innerHTML = "";
    
    const rootCategories = xmlDoc.querySelectorAll(":scope > category, poi_categories > category");
    
    if (rootCategories.length === 0) {
        container.innerHTML = "<p style='color: #ff5252; padding: 15px;'>No se encontraron categorías principales en el XML.</p>";
        return;
    }

    rootCategories.forEach((cat) => {
        container.appendChild(construirNodoXML(cat));
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
        if (key && value) {
            queries.push(`node(around:${radiusMeters}, ${lat}, ${lon})["${key}"="${value}"];`);
        }
    });

    if (queries.length === 0) {
        alert("Los elementos seleccionados no tienen etiquetas de mapeo válidas.");
        return;
    }

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
