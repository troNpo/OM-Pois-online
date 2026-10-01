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

    let xmlDoc;
    try {
        const response = await fetch("poi-mapping-overpass-turbo.xml");
        const text = await response.text();
        xmlDoc = new DOMParser().parseFromString(text, "text/xml");
        renderizarCategorias(xmlDoc);
    } catch (error) {
        console.error("Error al cargar el XML:", error);
        document.getElementById("categories-container").innerHTML = "<p style='color: #ff5252;'>Error al cargar categorías.</p>";
    }

    document.getElementById("btn-search").addEventListener("click", () => {
        if (!xmlDoc) {
            alert("El archivo XML aún no se ha cargado.");
            return;
        }
        ejecutarConsultaOverpass(lat, lon, xmlDoc);
    });
});

function renderizarCategorias(xmlDoc) {
    const container = document.getElementById("categories-container");
    container.innerHTML = "";
    const categories = xmlDoc.querySelectorAll("category");
    
    if (categories.length === 0) {
        container.innerHTML = "<p>No se encontraron categorías en el XML.</p>";
        return;
    }

    categories.forEach((cat, index) => {
        const name = cat.getAttribute("name") || cat.getAttribute("title") || `Categoría ${index + 1}`;
        const div = document.createElement("div");
        div.className = "category-item";
        div.innerHTML = `
            <label>
                <input type="checkbox" class="cat-checkbox" data-index="${index}">
                <span>${name}</span>
            </label>
        `;
        container.appendChild(div);
    });
}

async function ejecutarConsultaOverpass(lat, lon, xmlDoc) {
    const radiusKm = parseInt(document.getElementById("search-radius").value, 10);
    const radiusMeters = radiusKm * 1000;
    const maxResults = parseInt(document.getElementById("max-results").value, 10) || 3000;

    const checkboxes = document.querySelectorAll(".cat-checkbox:checked");
    if (checkboxes.length === 0) {
        alert("Por favor, selecciona al menos una categoría.");
        return;
    }

    let queries = [];
    checkboxes.forEach(chk => {
        queries.push(`node(around:${radiusMeters}, ${lat}, ${lon})["amenity"];`);
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
