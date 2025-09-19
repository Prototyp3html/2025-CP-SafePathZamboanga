# mpoly
Convert Input to a GeoJSON-Like MultiPolygon Geometry

## supported formats
- GeoJSON
- ArcGIS JSON
- Multidimensional Numerical Arrays

## usages
```js
import mpoly from "mpoly";

// data can be any GeoJSON type or ArcGIS JSON
const data = {
  type: "FeatureCollection",
  features: [ ... ]
};

mpoly.get(data);
[
    // first polygon
    [
      [ [40, 40], [20, 45], [45, 30], [40, 40] ]
    ],

    // second polygon
    [
      [ [20, 35], [10, 30], [10, 10], [30, 5], [45, 20], [20, 35] ], // exterior ring
      [ [30, 20], [20, 15], [20, 25], [30, 20] ], // hole
    ]
  ]
```
