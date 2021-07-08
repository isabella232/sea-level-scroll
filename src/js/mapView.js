var $ = require("./lib/qsa");
var View = require("./view");

var { isMobile } = require("./lib/breakpoints");
var mapKey = require("../../data/map_keys.sheet.json");
var assetKey = require("../../data/asset_keys.sheet.json");
var labelKey = require("../../data/label_keys.sheet.json");

var mapElement = $.one("#base-map");

var mapAssets = {};
var pastBounds = null;

module.exports = class MapView extends View {
  constructor(map) {
    super();
    this.map = map;
  }

  enter(slide) {
    super.enter(slide);
    var map = this.map;

    mapElement.classList.add("active");
    mapElement.classList.remove("exiting");
    var currLayer = mapKey[slide.id];
    var assets = getLayerVals(currLayer, "assets");
    var labels = getLayerVals(currLayer, "label_ids");

    // Remove old layers if layer isn't in new map
    var keepAssets = [];
    map.eachLayer(function (layer) {
      var id = layer.options.id;
      if (
        !id ||
        id == "baseLayer" ||
        assets.includes(id) ||
        labels.includes(id)
      ) {
        keepAssets.push(id);
        return;
      }
      map.removeLayer(layer);
    });
    assets = assets.filter(k => !keepAssets.includes(k));
    labels = labels.filter(k => !keepAssets.includes(k));

    var bounds = getBounds(currLayer);
    if (!bounds.equals(pastBounds)) {
      map.flyToBounds(bounds, {
        animate: true,
        duration: currLayer.duration,
        noMoveStart: true,
        easeLinearity: 0,
        speed: 0.2, // make the flying slow
        curve: 1, // change the speed at which it zooms out
      });
      pastBounds = bounds;
    }

    // Add new layers onto slide.
    addAssets(map, assets);
    addMarkers(map, labels, bounds);
  }

  exit(slide) {
    super.exit(slide);
    mapElement.classList.add("exiting");
    mapElement.classList.remove("active");
    setTimeout(() => mapElement.classList.remove("exiting"), 1000);
  }

  preload = async function (slide, preZoom) {
    var layer = mapKey[slide.id];
    var assets = getLayerVals(layer, 'assets');
    assets.forEach(function (a) {
      if (!mapAssets[a]) loadAsset(assetKey[a], a);
    });
    if (preZoom) this.map.fitBounds(getBounds(layer));
  };
};

var addMarkers = function (map, labels, bounds) {
  labels.forEach(function (a) {
    var label = labelKey[a];
    if (!label) return;
    var [lat, lon] = label.lat_long.split(",").map(b => Number(b));
    if (isMobile && label.mobile_lat_long) {
      if (label.mobile_lat_long == "hide") return;
      [lat, lon] = label.mobile_lat_long.split(",").map(a => a.trim());
    }

    var marker = new L.Marker([lat, lon], {
        id: a.trim(),
        icon: new L.DivIcon({
          className: label.classNames.split(",").join(" "),
          html: function(){            
            if (label.classNames.includes("company")) {
              return `
              <svg viewBox="0 0 600 600">\
                <path fill="transparent" id="curve" d=\
                      "M100,150 C200,100 400,100 500,150" />\
                <text class="curve" width="300">\
                  <textPath xlink:href="#curve">\
                    ${label.label} \
                  </textPath>\
                </text>\
              </svg>\
            `
            }
            
            else {
              return `<span>${label.label}</span>`;
            }
          }(),
          iconSize: [label.label_width,20]
        }),
      }).addTo(map);
  });
};

// Add all current assets to the map.
var addAssets = function (map, assets) {
  assets.forEach(function (a) {
    if (mapAssets[a]) {
      mapAssets[a].addTo(map);
    } else {
      loadAsset(assetKey[a], a, map);
    }
  });
};

// Get lat/long bounds to zoom to.
var getBounds = function (layer) {
  var southWestBounds = isMobile
    ? layer.mobile_southWest.split(",")
    : layer.southWest.split(",");
  var northEastBounds = isMobile
    ? layer.mobile_northEast.split(",")
    : layer.northEast.split(",");

  var southWest = L.latLng(southWestBounds[0], southWestBounds[1]),
    northEast = L.latLng(northEastBounds[0], northEastBounds[1]),
    bounds = L.latLngBounds(southWest, northEast);
  return bounds;
};

// Async fetch assets.
var fetchAsset = async function (asset) {
  var response = await fetch(`../assets/synced/${asset}`);
  var json = await response.json();
  return json;
};

// Loads an asset, optionally adds to map.
var loadAsset = function (value, id, opt_map) {
  if (!value.path) return;
  var styles = { className: value.classNames.split(",").join("") };
  fetchAsset(value.path).then(function (d) {
    mapAssets[id] = L.geoJSON(d, { id: id, style: styles });
    if (opt_map) mapAssets[id].addTo(opt_map);
  });
};

var getLayerVals = function (layer, prop) {
  return layer[prop] ? layer[prop].split(",").map(d => d.trim()) : [];
};
