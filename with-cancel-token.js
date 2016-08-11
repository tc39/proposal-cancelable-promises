"use strict";

Promise.withCancelToken = function (cancelToken, executor) {
  if (cancelToken !== undefined && !isCancelToken(cancelToken)) {
    throw new TypeError("cancelToken must be either undefined or a CancelToken");
  }

  if (typeof executor !== "function") {
    throw new TypeError("The executor must be a function");
  }

  return new this((resolve, reject) => {
    const cancelAction = executor(resolve, reject);

    if (cancelAction === undefined) {
      return;
    }

    if (typeof cancelAction !== "function") {
      throw new TypeError("cancelAction must be a function");
    }

    if (cancelToken === undefined) {
      return;
    }

    cancelToken.promise.then(cancelation => {
      let thrown = true;

      try {
        cancelAction(cancelation);
        thrown = false;
      } catch (resultE) {
        reject(resultE);
      }

      if (!thrown) {
        reject(cancelation);
      }
    });
  });
};
