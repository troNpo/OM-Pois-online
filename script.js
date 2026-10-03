let xmlDocGlobal = null;
let miniMap = null;
let currentLat = 40.4168;
let currentLon = -3.7038;

const uiTranslations = {
    es: {
        app_title: "POI Exporter",
        map_preview: "Vista previa del área",
        label_radius: "Radio",
        label_categories: "Categorías",
        label_expand: "Expandir",
        area_text: "Superficie del área"
    },
    en: {
        app_title: "POI Exporter",
        map_preview: "Area preview",
        label_radius: "Radius",
        label_categories: "Categories",
        label_expand: "Expand",
        area_text: "Area surface"
    },
    de: {
        app_title: "POI Exporter",
        map_preview: "Bereichsvorschau",
        label_radius: "Radius",
        label_categories: "Kategorien",
        label_expand: "Erweitern",
        area_text: "Fläche"
    },
    fr: {
        app_title: "POI Exporter",
        map_preview: "Aperçu de la zone",
        label_radius: "Rayon",
        label_categories: "Catégories",
        label_expand: "Développer",
        area_text: "Surface de la zone"
    },
    it: {
        app_title: "POI Exporter",
        map_preview: "Anteprima dell'area",
        label_radius: "Raggio",
        label_categories: "Categorie",
        label_expand: "Espandi",
        area_text: "Superficie dell'area"
    },
    nl: {
        app_title: "POI Exporter",
        map_preview: "Gebiedsvoorbeeld",
        label_radius: "Straal",
        label_categories: "Categorieën",
        label_expand: "Uitvouwen",
        area_text: "Oppervlakte"
    }
};

let currentAreaValue = 78.5;

function actualizarTextosUI() {
    const selectLang = document.getElementById("select-lang");
    const lang = selectLang ? selectLang.value : "es";
    const translations = uiTranslations[lang] || uiTranslations["es"];

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (translations[key]) {
            el.textContent = translations[key];
        }
    });

    const infoArea = document.getElementById("info-area");
    if (infoArea) {
        const areaLabel = translations["area_text"] || "Superficie del área";
        infoArea.innerText = `${areaLabel}: ${currentAreaValue.toFixed(1)} km²`;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("category-container");
    container.innerHTML = "<p style='color: #ffa726; padding: 15px;'>Cargando categorías...</p>";

    const urlParams = new URLSearchParams(window.location.search);
    currentLat = parseFloat(urlParams.get("lat")) || 40.4168;
    currentLon = parseFloat(urlParams.get("lon")) || -3.7038;

    actualizarTextosUI();

    // Inicializar Mapa estático MapLibre de forma segura
    try {
        inicializarMiniMapa();
    } catch (e) {
        console.error("Error al inicializar MapLibre:", e);
    }

    // Control del Acordeón del Mapa (Corregido para evaluar correctamente el estado display)
    const btnToggleMap = document.getElementById("btn-toggle-map");
    const mapContainerCollapse = document.getElementById("map-container-collapse");
    if (btnToggleMap && mapContainerCollapse) {
        btnToggleMap.addEventListener("click", () => {
            const isHidden = mapContainerCollapse.style.display === "none" || mapContainerCollapse.style.display === "";
            mapContainerCollapse.style.display = isHidden ? "block" : "none";
            btnToggleMap.classList.toggle("active", isHidden);
            
            // Forzar renderizado de MapLibre y recentrar al desplegarse
            if (isHidden && miniMap) {
                setTimeout(() => {
                    miniMap.resize();
                    miniMap.jumpTo({ center: [currentLon, currentLat] });
                }, 100);
            }
        });
    }

    // Control del Slider de radio y cálculo de superficie + radio en mapa
    const radiusSlider = document.getElementById("search-radius");
    const radiusValueSpan = document.getElementById("radius-value");

    function actualizarCalculosRadio(r) {
        const radioNum = parseFloat(r) || 0;
        if (radiusValueSpan) {
            radiusValueSpan.innerText = radioNum;
        }
        currentAreaValue = Math.PI * Math.pow(radioNum, 2);
        actualizarTextosUI();
        actualizarCirculoRadioMapa(radioNum);
    }

    if (radiusSlider) {
        actualizarCalculosRadio(radiusSlider.value);
        radiusSlider.addEventListener("input", (e) => {
            actualizarCalculosRadio(e.target.value);
        });
    }

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

    const selectLang = document.getElementById("select-lang");
    if (selectLang) {
        selectLang.addEventListener("change", () => {
            actualizarTextosUI();
            if (xmlDocGlobal) {
                renderizarArbolCategorias(xmlDocGlobal);
            }
        });
    }

    const btnClear = document.getElementById("btn-clear");
    if (btnClear) {
        btnClear.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll("input[type='checkbox']");
            checkboxes.forEach(chk => chk.checked = false);
            if (toggleExpandAll) toggleExpandAll.checked = false;
        });
    }

    // --- MODO EDICIÓN ---
    const btnEditMode = document.getElementById("btn-edit-mode");
    const editActionsGroup = document.querySelector(".edit-actions-group");
    const btnValidateEdit = document.getElementById("btn-validate-edit");
    const btnRestoreEdit = document.getElementById("btn-restore-edit");

    if (btnEditMode) {
        btnEditMode.addEventListener("click", () => {
            document.body.classList.toggle("is-editing");
            const isEditing = document.body.classList.contains("is-editing");
            if (editActionsGroup) editActionsGroup.style.display = isEditing ? "flex" : "none";
            if (xmlDocGlobal) renderizarArbolCategorias(xmlDocGlobal);
        });
    }

    if (btnValidateEdit) {
        btnValidateEdit.addEventListener("click", () => {
            document.body.classList.remove("is-editing");
            if (editActionsGroup) editActionsGroup.style.display = "none";
            if (xmlDocGlobal) {
                renderizarArbolCategorias(xmlDocGlobal);
            }
        });
    }

    if (btnRestoreEdit) {
        btnRestoreEdit.addEventListener("click", () => {
            localStorage.removeItem("hidden_categories");
            document.body.classList.remove("is-editing");
            if (editActionsGroup) editActionsGroup.style.display = "none";
            if (xmlDocGlobal) renderizarArbolCategorias(xmlDocGlobal);
        });
    }

    // Carga independiente del XML de categorías
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
        container.innerHTML = `<p style='color: #ff5252; padding: 15px;'>Error al cargar categorías: ${error.message}</p>`;
    }

    const btnSearch = document.getElementById("btn-search");
    if (btnSearch) {
        btnSearch.addEventListener("click", () => {
            if (!xmlDocGlobal) {
                alert("El archivo XML aún no se ha cargado correctamente.");
                return;
            }
            ejecutarConsultaOverpass(currentLat, currentLon);
        });
    }
});

// --- INICIALIZACIÓN Y CONFIGURACIÓN DEL MAPA CON MAPLIBRE (SOLO OSM) ---
function inicializarMiniMapa() {
    const mapContainer = document.getElementById('mini-map');
    if (!mapContainer) return;

    miniMap = new maplibregl.Map({
        container: 'mini-map',
        style: {
            version: 8,
            sources: {
                'osm-raster': {
                    type: 'raster',
                    tiles: [
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; OpenStreetMap Contributors | <a href="https://maplibre.org/" target="_blank">MapLibre</a>'
                }
            },
            layers: [
                {
                    id: 'osm-layer',
                    type: 'raster',
                    source: 'osm-raster',
                    minzoom: 0,
                    maxzoom: 19
                }
            ]
        },
        center: [currentLon, currentLat],
        zoom: 11,
        interactive: false
    });

    miniMap.on('load', () => {
        const radiusSlider = document.getElementById("search-radius");
        const currentRadius = radiusSlider ? parseFloat(radiusSlider.value) || 5 : 5;
        agregarCapaRadioAlMapa(currentRadius);
    });
}


function getMapStyle(type) {
    if (type === 'esri') {
        return {
            version: 8,
            sources: {
                'esri-sat': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: 'Esri'
                }
            },
            layers: [
                {
                    id: 'esri-sat-layer',
                    type: 'raster',
                    source: 'esri-sat',
                    minzoom: 0,
                    maxzoom: 22
                }
            ]
        };
    } else {
        return {
            version: 8,
            sources: {
                'osm-raster': {
                    type: 'raster',
                    tiles: [
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; OpenStreetMap Contributors'
                }
            },
            layers: [
                {
                    id: 'osm-layer',
                    type: 'raster',
                    source: 'osm-raster',
                    minzoom: 0,
                    maxzoom: 19
                }
            ]
        };
    }
}

function crearGeoJsonCirculo(centerLon, centerLat, radiusKm, points = 64) {
    const coords = { latitude: centerLat, longitude: centerLon };
    const km = radiusKm;
    const ret = [];
    const distanceX = km / (111.320 * Math.cos(centerLat * Math.PI / 180));
    const distanceY = km / 110.574;

    for (let i = 0; i < points; i++) {
        const theta = (i / points) * (2 * Math.PI);
        const x = coords.longitude + (distanceX * Math.cos(theta));
        const y = coords.latitude + (distanceY * Math.sin(theta));
        ret.push([x, y]);
    }
    ret.push(ret[0]);

    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [ret]
        }
    };
}

function agregarCapaRadioAlMapa(radiusKm) {
    if (!miniMap) return;

    const geojsonData = crearGeoJsonCirculo(currentLon, currentLat, radiusKm);

    if (miniMap.getSource('search-radius-source')) {
        miniMap.getSource('search-radius-source').setData(geojsonData);
    } else {
        miniMap.addSource('search-radius-source', {
            type: 'geojson',
            data: geojsonData
        });

        miniMap.addLayer({
            id: 'radius-fill',
            type: 'fill',
            source: 'search-radius-source',
            paint: {
                'fill-color': '#b71c1c',
                'fill-opacity': 0.2
            }
        });

        miniMap.addLayer({
            id: 'radius-stroke',
            type: 'line',
            source: 'search-radius-source',
            paint: {
                'line-color': '#ff5252',
                'line-width': 2
            }
        });

        const markerEl = document.createElement('div');
        markerEl.className = 'center-map-marker';
        markerEl.style.width = '14px';
        markerEl.style.height = '14px';
        markerEl.style.backgroundColor = '#b71c1c';
        markerEl.style.border = '2px solid white';
        markerEl.style.borderRadius = '50%';
        markerEl.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';

        new maplibregl.Marker({ element: markerEl })
            .setLngLat([currentLon, currentLat])
            .addTo(miniMap);
    }

    const zoomLevel = Math.max(8, Math.min(14, 12 - Math.log2(radiusKm)));
    miniMap.jumpTo({ center: [currentLon, currentLat], zoom: zoomLevel });
}

function actualizarCirculoRadioMapa(radiusKm) {
    if (!miniMap || !miniMap.getSource('search-radius-source')) return;
    const geojsonData = crearGeoJsonCirculo(currentLon, currentLat, radiusKm);
    miniMap.getSource('search-radius-source').setData(geojsonData);
    
    const zoomLevel = Math.max(8, Math.min(14, 12 - Math.log2(radiusKm)));
    miniMap.jumpTo({ center: [currentLon, currentLat], zoom: zoomLevel });
}

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

function obtenerCategoriasOcultas() {
    try {
        return JSON.parse(localStorage.getItem("hidden_categories")) || [];
    } catch (e) {
        return [];
    }
}

function guardarCategoriasOcultas(hiddenList) {
    localStorage.setItem("hidden_categories", JSON.stringify(hiddenList));
}

function construirNodoXML(categoryElem) {
    const titleAttr = categoryElem.getAttribute("title") || "Categoría";
    const name = obtenerTraduccion(categoryElem, titleAttr);

    const hiddenList = obtenerCategoriasOcultas();
    const isHidden = hiddenList.includes(titleAttr);

    const nodeDiv = document.createElement("div");
    nodeDiv.className = "category-node";
    if (isHidden) {
        nodeDiv.classList.add("category-hidden-by-user");
    }

    const rowDiv = document.createElement("div");
    rowDiv.className = "category-row";

    const eyeBtn = document.createElement("button");
    eyeBtn.className = "btn-toggle-visibility";
    eyeBtn.innerHTML = `<img src="./ui-icons/${isHidden ? 'eye-no.svg' : 'eye.svg'}" alt="Visibilidad">`;
    
    eyeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        let currentHidden = obtenerCategoriasOcultas();
        if (currentHidden.includes(titleAttr)) {
            currentHidden = currentHidden.filter(t => t !== titleAttr);
            nodeDiv.classList.remove("category-hidden-by-user");
            eyeBtn.querySelector("img").src = "./ui-icons/eye.svg";
        } else {
            currentHidden.push(titleAttr);
            nodeDiv.classList.add("category-hidden-by-user");
            eyeBtn.querySelector("img").src = "./ui-icons/eye-no.svg";
        }
        guardarCategoriasOcultas(currentHidden);
    });

    const subCategories = Array.from(categoryElem.querySelectorAll(":scope > category"));
    const mappings = Array.from(categoryElem.querySelectorAll(":scope > mapping"));
    const hasChildren = subCategories.length > 0 || mappings.length > 0;

    if (mappings.length > 0 && subCategories.length === 0) {
        const mapElem = mappings[0];
        const tagAttr = mapElem.getAttribute("tag");
        let tagKey = "";
        let tagValue = "";
        if (tagAttr) {
            [tagKey, tagValue] = tagAttr.split("=");
        }

        rowDiv.className = "category-row category-leaf";
        rowDiv.innerHTML = `
            <div class="category-left">
                <input type="checkbox" class="subcat-checkbox" data-key="${tagKey}" data-value="${tagValue}">
                <span>${name}</span>
            </div>
        `;
        rowDiv.querySelector(".category-left").prepend(eyeBtn);
        nodeDiv.appendChild(rowDiv);
        return nodeDiv;
    }

    rowDiv.innerHTML = `
        <div class="category-left">
            <input type="checkbox" class="cat-checkbox">
            <span>${name}</span>
        </div>
        <div class="category-arrow">${hasChildren ? '›' : ''}</div>
    `;
    rowDiv.querySelector(".category-left").prepend(eyeBtn);

    const checkbox = rowDiv.querySelector("input[type='checkbox']");
    const childrenDiv = document.createElement("div");
    childrenDiv.className = "category-children";

    if (hasChildren) {
        rowDiv.addEventListener("click", (e) => {
            if (e.target === checkbox || e.target.closest(".btn-toggle-visibility")) return;
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
            mapRow.className = "category-row category-leaf";
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
    const radiusSlider = document.getElementById("search-radius");
    const radiusKm = radiusSlider ? parseInt(radiusSlider.value, 10) : 5;
    const radiusMeters = radiusKm * 1000;
    const maxResults = 3000;

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
