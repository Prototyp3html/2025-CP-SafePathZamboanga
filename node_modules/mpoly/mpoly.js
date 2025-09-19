const getDepth = require("get-depth");
const meta = require("@turf/meta");
const booleanClockwise = require("@turf/boolean-clockwise").default;

// supports nested feature collections
function eachPart(it, callback) {
  if (Array.isArray(it.features)) {
    it.features.forEach(feat => {
      eachPart(feat, callback);
    });
  } else {
    callback(it);
  }
}

function each(geom, callback) {
  // pre-processing steps
  if (typeof geom === "string") geom = JSON.parse(geom);

  if (Array.isArray(geom?.geometry?.rings) || Array.isArray(geom?.rings)) {
    // convert esri to geojson polygons
    // ESRI JSON is a real pain here
    // exterior rings are clockwise
    // holes are counter-clockwise

    let current;
    const rings = geom?.geometry?.rings || geom?.rings;
    rings.forEach(ring => {
      if (booleanClockwise(ring)) {
        // new polygon, so push any existing rings
        if (current) callback(current);
        current = [ring];
      } else {
        current.push(ring);
      }
    });
    callback(current);
  } else if ("type" in geom) {
    eachPart(geom, part => {
      meta.geomEach(part, it => {
        if (it.type === "Polygon") {
          callback(it.coordinates);
        } else if (it.type === "MultiPolygon") {
          it.coordinates.forEach(polygon => {
            callback(polygon);
          });
        }
      });
    });
  } else if (Array.isArray(geom)) {
    const depth = getDepth(geom);
    if (depth === 4) {
      geom.forEach(polygon => {
        callback(polygon);
      });
    } else if (depth === 3) {
      callback(geom);
    } else if (depth === 2) {
      callback([geom]);
    }
  }
}

function get(it) {
  const polygons = [];
  each(it, polygon => polygons.push(polygon));
  return polygons;
}

module.exports = {
  each,
  get
};
