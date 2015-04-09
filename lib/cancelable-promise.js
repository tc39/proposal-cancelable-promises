const { get_slot } = require("especially/meta");
import Promise from "./promise.js";

export default class CancelablePromise extends Promise {
  constructor(executor, onCanceled) {
    let superResolve, superReject;
    super((resolve, reject) => {
      superResolve = resolve;
      superReject = reject;
    });

    this._canceled = false;
    this._onCanceled = onCanceled;

    const resolvingFunctions = CreateCancelableResolvingFunctions(this, superResolve, superReject);

    try {
      executor(resolvingFunctions.Resolve, resolvingFunctions.Reject);
    } catch (completionE) {
      resolvingFunctions.Reject(completionE);
    }
  }

  cancel() {
    if (get_slot(this, "[[PromiseState]]") !== "pending") {
      return;
    }

    this._canceled = true;
    this._onCanceled();
  }
}

function CreateCancelableResolvingFunctions(promise, resolve, reject) {
  // This function will probably mutate to have custom resolving functions that use the spec abstract operations
  // directly, instead of wrapping the original resolve/reject. But for now this suffices.
  return {
    Resolve: v => {
      if (promise._canceled) {
        return;
      }
      resolve(v);
    },
    Reject: r => {
      if (promise._canceled) {
        return;
      }
      reject(r);
    }
  };
}
