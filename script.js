document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = parseFloat(urlParams.get("lat")) || 40.4168;
    const lon = parseFloat(urlParams.get("lon")) || -3.7038;

    document.getElementById("info-coords").innerText = `Centro: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`;

    const radiusSlider = document.getElementById("search-radius");
    const radiusValueSpan = document.getElementById("radius-value");
    radiusSlider.addEventListener("input", (e) => {
        radiusValueSpan.innerText = e.target.value;
    });

    // Control para el checkbox global de "Expandir nodos"
    const toggleExpandAll = document.getElementById("toggle-expand-all");
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

    let xmlDoc;
    try {
        const response = await fetch("poi-mapping-overpass-turbo.xml");
        const text = await response.text();
        xmlDoc = new DOMParser().parseFromString(text, "text/xml");
        renderizarCategorias(xmlDoc);
    } catch (error) {
        console.error("Error al cargar el XML:", error);
        document.getElementById("category-container").innerHTML = "<p style='color: #ff5252;'>Error al cargar categorías.</p>";
    }

    document.getElementById("btn-search").addEventListener("click", () => {
        if (!xmlDoc) {
            alert("El archivo XML aún no se ha cargado.");
            return;
        }
        ejecutarConsultaOverpass(lat, lon);
    });
});

function renderizarCategorias(xmlDoc) {
    const container = document.getElementById("category-container");
    container.innerHTML = "";
    const categories = xmlDoc.querySelectorAll("category");
    
    if (categories.length === 0) {
        container.innerHTML = "<p>No se encontraron categorías en el XML.</p>";
        return;
    }

    const lang = "es"; // Idioma por defecto

    categories.forEach((cat) => {
        const key = cat.getAttribute("key");
        const nameNode = cat.querySelector("name");
        const catName = nameNode ? (nameNode.getAttribute(lang) || nameNode.getAttribute("es") || key) : key;

        // Crear contenedor del grupo (Acordeón)
        const groupDiv = document.createElement("div");
        groupDiv.className = "category-group";

        // Cabecera comprimida de la categoría principal
        const headerDiv = document.createElement("div");
        headerDiv.className = "category-header";
        headerDiv.innerHTML = `<span>${catName} (${key})</span> <span class="arrow">▼</span>`;
        
        // Evento para expandir/contraer al hacer clic en la cabecera
        headerDiv.addEventListener("click", () => {
            groupDiv.classList.toggle("active");
        });

        // Contenedor de las subcategorías (elementos internos)
        const itemsDiv = document.createElement("div");
        itemsDiv.className = "category-items";

        const subcategories = cat.querySelectorAll("subcategory");
        subcategories.forEach((sub) => {
            const subValue = sub.getAttribute("value");
            const subNameNode = sub.querySelector("name");
            const subName = subNameNode ? (subNameNode.getAttribute(lang) || subNameNode.getAttribute("es") || subValue) : subValue;

            const label = document.createElement("label");
            label.innerHTML = `
                <input type="checkbox" class="subcat-checkbox" data-key="${key}" data-value="${subValue}">
                <span>${subName} (${subValue})</span>
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
        alert("Por favor, selecciona al menos una subcategoría.");
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
