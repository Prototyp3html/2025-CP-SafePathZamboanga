# quick-promise
QuickPromise.  Resolve Synchronously When Possible.

# usage
```js
import QuickPromise from "quick-promise";
```

## QuickPromise.all
```js
let resolved = false;
QuickPromise.all([1, 2]).then(nums => (resolved = true));
// resolved is true

let resolved = false;
QuickPromise.all([fetch(url), 9]).then([response, n]) => (resolved = true));
// resolved is false
```

## QuickPromise.resolve
```js
let resolved = false;
QuickPromise.resolve(1).then(num => (resolved = true));
// resolved is true

let resolved = false;
QuickPromise.resolve(fetch(url)).then(response => (resolved = true));
// resolved is false

let resolved = false;
await QuickPromise.resolve(fetch(url)).then(response => (resolved = true));
// resolved is true
```