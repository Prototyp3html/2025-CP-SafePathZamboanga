class QuickPromise {
  static isPromise(it) {
    return typeof it === "object" && typeof it.then === "function";
  }

  static all(it) {
    if (!it.some(QuickPromise.isPromise)) {
      return { then: func => func(it) };
    } else {
      return Promise.all(it);
    }
  }

  static resolve(it) {
    if (typeof it === "object" && typeof it.then === "function") {
      // it appears to be a promise
      return it;
    } else {
      return { then: func => func(it) };
    }
  }
}

if (typeof define === "function" && define.amd) {
  define(function () {
    return QuickPromise;
  });
}

if (typeof module === "object") {
  module.exports = QuickPromise;
  module.exports.default = QuickPromise;
}

if (typeof self === "object") {
  self.QuickPromise = QuickPromise;
}

if (typeof window === "object") {
  window.QuickPromise = QuickPromise;
}
