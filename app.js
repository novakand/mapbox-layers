import { mapOptions } from "./js/constants/map-options.js";
import { data } from "./data-storage/data.js";
import { rgisZonesStyle } from "./data-storage/rgisZonesStyle.js";
import { rgisLayers } from "./data-storage/rgisLayers.js";
import { cadastre } from "./data-storage/data-cadastre.js";

let map;

async function onInit() {
    document.querySelector('#map').setAttribute('data-load', true);
    onInitMapsAPI();
}

function getQueryParams() {
    const url = new URL(window.location.href);
    return url.searchParams;
}

function updateQueryParam(key, value) {
    const queryParams = getQueryParams();
    queryParams.set(key, value);
    const newUrl = new URL(window.location.href);
    newUrl.search = queryParams.toString();
    window.history.replaceState({}, '', newUrl.toString());
}

function fromPkkToOlExtent(pkkExtent) {
    if (!pkkExtent) throw new Error("Extent не задан!");
    return [
        +pkkExtent.min.longitude,
        +pkkExtent.min.latitude,
        +pkkExtent.max.longitude,
        +pkkExtent.max.latitude,
    ];
}


const g = fromPkkToOlExtent(cadastre?.pkk?.extent);

function buildBbox(extent) {
    let dx = extent.xmax - extent.xmin;
    let dy = extent.ymax - extent.ymin;
    const bbox = `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`;
    switch (true) {
        case dx < dy:
            return { point: [(dy - dx) / 2, 0], bbox };
        case dx > dy:
            return { point: [0, (dx - dy) / 2], bbox };
        default:
            return { point: [0, 0], bbox };
    }
}

function buildBounds(extent) {
    const { point, bbox } = buildBbox(extent);
    const min = convertCoordinates([extent.xmin - point[0], extent.ymin - point[1]]);
    const max = convertCoordinates([extent.xmax + point[0], extent.ymax + point[1]]);
    return {
        bounds: [min[1], min[0], max[1], max[0]],
        bbox
    }
}

function convertCoordinates(point) {
    return [(2 * Math.atan(Math.exp(point[1] / 6378137)) - Math.PI / 2) / (Math.PI / 180), point[0] / (Math.PI / 180.0) / 6378137.0];
}


function buildUrlImage(data) {
    const { bbox, attrs, type } = data;
    return `${'https://xn--c1adzl.xn--c1avg/map-w-pkk/api/'}rosreestr/cadastre-selected.php?bbox=${bbox}&id=${attrs.id}&type=${type}&layerDefs=${getLayers(type, attrs.id)}`
}

function pkkCidFormat(cid) {
    return cid.replace(
        /(\d{1,2}):(\d{1,2}):(0*\d*):(\d*)/,
        function (match, p1, p2, p3, p4, offset, string) {
            return [p1, p2, p3, p4]
                .map((chunk) => chunk.replace(/^0*/, ""))
                .join(":");
        }
    );
}

function focusObject({ cid, type }) {
    const LAYERS_API_URL = 'https://egrn.click/next/api/layers';
    const layersOptions = {
        zu: {
            layers: [6, 7, 8, 9],
            url: `${LAYERS_API_URL}/arcgis/rest/services/PKK6/CadastreSelected/MapServer`,
        },
        oks: {
            layers: [0, 1, 2, 3, 4, 5],
            url: `${LAYERS_API_URL}/arcgis/rest/services/PKK6/CadastreSelected/MapServer`,
        },
        tzone: {
            layers: [1],
            url: `${LAYERS_API_URL}/arcgis/rest/services/PKK6/ZONESSelected/MapServer`,
        },
        zone: {
            layers: [6],
            url: `${LAYERS_API_URL}/arcgis/rest/services/PKK6/ZONESSelected/MapServer`,
        },
        zouit: {
            layers: [0],
            url: `${LAYERS_API_URL}/arcgis/rest/services/PKK6/ZONESSelected/MapServer`,
        },
    };

    const { layers, url } = layersOptions[type];

    const options = {
        url,
        params: {
            layers: `show:${layers}`,
            layerDefs: JSON.stringify(
                layers.reduce((acc, layer) => ((acc[layer] = `id = '${cid}'`), acc), {})
            ),
        },
    };
    const { bounds } = buildBounds(cadastre?.pkk?.extent2);

    const t = `https://test.bstrv.ru/api/selected`
    map.addSource('radar2', {
        'type': 'image',
        'url': t,
        'coordinates': [
            [37.421715740237, 56.032766196212],
            [37.417107454059, 56.032766196212],
            [37.417107454059, 56.031391159505],
            [37.421715740237, 56.031391159505]
        ]
    });
    map.addLayer({
        id: 'radar-layer',
        'type': 'raster',
        'source': 'radar2',
        'paint': {
            'raster-fade-duration': 0,
        }
    });
}

function refreshActiveBboxLayers(map) {
    const { _ne, _sw } = map.getBounds();
    const url = `${'https://test.bstrv.ru/api/geojson'}?bbox=${[_sw.lng, _sw.lat, _ne.lng, _ne.lat].join(
        ","
    )}&zoom=${map.getZoom()}`;

    fetch(url)
        .then((res) => res.json())
        .then(async (data) => {
            if (map?.getSource('l')) {
                map?.getSource('l').setData(addStats(data));
                map?.getSource('l-text').setData(addStats(data));
            }
            if (!data.features) {
                console.warn('!datafeatures')
                console.warn(data)
                console.warn(url)
                return
            }
        })
}


function initBingMaps(map) {

    map.on("moveend", () => {
        refreshActiveBboxLayers(map);
    });

    data
        .filter(({ source }) => !!source?.data)
        .forEach((layer, index) => {
            const stroke =
                rgisZonesStyle?.[layer?.source?.name || ""].color.stroke;
            const fill = rgisZonesStyle?.[layer?.source?.name || ""].color.fill;
            map.addLayer({
                id: 'tesr' + index,
                type: stroke ? 'line' : fill ? 'fill' : '',
                slot: 'middle',
                source: {
                    'type': 'geojson',
                    'data': layer.source?.data
                },
                paint: {
                    ...(stroke && { 'line-color': stroke, "line-width": 2, }),
                    ...(fill && { 'fill-color': fill, "fill-opacity": 0.7 })
                },
                layout: {
                    'visibility': 'visible'
                }
            });
        });
}

function onInitMapsAPI() {
    // mapboxgl.accessToken = 'pk.eyJ1IjoibW91dmVyIiwiYSI6ImNsdXQ0YWdsaDA0ejgya2xiMmJzNWY5NnEifQ.6kW6KD9OxVJARo1yAkp4-w';

    mapboxgl.accessToken = 'pk.eyJ1Ijoibm92YWthbmQiLCJhIjoiY2p3OXFlYnYwMDF3eTQxcW5qenZ2eGNoNCJ9.PTZDfrwxfMd-hAwzZjwPTg';

    onPreloader(false);
    map = new mapboxgl.Map(mapOptions);
    map.on('load', () => {

        initBingMaps(map);

        map.addLayer(
            {
                'id': 'wms-test-layer',
                'type': 'raster',
                source: {
                    type: 'raster',
                    tiles: [
                        'https://test.bstrv.ru/api/layer-rosreestr?bbox={bbox-epsg-3857}&layers=show%3A27%2C24%2C23%2C22'],

                    tileSize: 1024
                },
                'paint': {}
            }

        );

        map.addLayer(
            {
                'id': 'wms-test-layer2',
                'type': 'raster',
                source: {
                    type: 'raster',
                    tiles: [
                        'https://test.bstrv.ru/api/layer-rosreestr?bbox={bbox-epsg-3857}&layers=show%3A30'],

                    tileSize: 1024
                },
                'paint': {}
            }

        );



        const type = 'zu';
        focusObject({
            cid: pkkCidFormat('50:41:0030401:1'),
            type,
        })

        const { _ne, _sw } = map.getBounds();

        const url = `${'https://test.bstrv.ru/api/geojson'}?bbox=${[_sw.lng, _sw.lat, _ne.lng, _ne.lat].join(
            ","
        )}&zoom=${map.getZoom()}`;

        fetch(url)
            .then((res) => res.json())
            .then(async (data) => {
                map.addLayer({
                    id: 'l',
                    type: 'fill',
                    slot: 'middle',

                    source: {
                        'type': 'geojson',
                        'data': addStats(data)
                    },
                    paint: {
                        'fill-outline-color': ['get', 'outline'],
                        'fill-opacity': 0.3,
                        'fill-color': ['get', 'color'],

                    },
                    layout: {},
                });
                map.addLayer({
                    id: 'l-text',
                    type: 'symbol',
                    slot: 'middle',
                    source: {
                        'type': 'geojson',
                        'data': addStats(data)
                    },
                    paint: {
                        'text-color': '#000',
                    },
                    layout: {
                        'text-field': ['get', 'name'],
                        "symbol-spacing": 115,
                        "text-size": 10,
                        "text-allow-overlap": false,
                        "text-ignore-placement": false,
                        'text-font': [
                            'Open Sans Bold',
                            'Arial Unicode MS Bold'
                        ],
                        'text-size': 9,
                        'text-transform': 'uppercase',
                        'text-letter-spacing': 0.05,
                        'text-offset': [
                            'step',                         // Expression type (discrete matching)
                            ['get', 'point_count'],         // Variable to compare to
                            ['literal', [-0.84, 0.23]],     // Default value (if none of the following match)
                            5, ['literal', [-0.94, 0.25]], // if point_count === 10: [-0.94, 0.25]
                            20, ['literal', [-0.99, 0.28]] // if point_count === 100: [-0.94, 0.28]
                        ]
                    },
                });
            });
    });
}

function addStats(geojson) {
    geojson.features.forEach((feature) => {
        const layerData = rgisLayers.pzzZones;
        let d = layerData.styles.find(({ id }) => id == feature.properties.feature_id);
        d.name = d.name.replace(/\s*\(\d*\)/, "");
        if (d) {
            feature.properties = Object.assign(feature.properties, d);
        }
    });

    return geojson;
}

function onPreloader(isShow) {
    const preloader = document.querySelector('.mdc-linear-progress');
    delay(1000).then(() => isShow ? preloader.style.width = '100%' : preloader.style.width = '0');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', onInit);