const { SpeciesConstructor, Type, Call } = require("especially/abstract-operations");
const { get_slot, set_slot } = require("especially/meta");
import { default as Promise, NewPromiseCapability, PerformPromiseThen, TriggerPromiseReactions } from "./promise.js";

export default class CancelablePromise extends Promise {
  constructor(executor) {
    let superResolve, superReject, superCancel;
    super((resolve, reject, cancel) => {
      superResolve = resolve;
      superReject = reject;
      superCancel = cancel;
    });

    this._cancellationParent = null;
    this._childrenCount = 0;
    this._cancellor = superCancel;

    const resolvingFunctions = {
      Resolve: superResolve,
      Reject: superReject,
      Cancel: superCancel
    };

    try {
      this._onCanceled = executor(resolvingFunctions.Resolve, resolvingFunctions.Reject, resolvingFunctions.Cancel);
    } catch (completionE) {
      resolvingFunctions.Reject(completionE);
    }
  }

  then(onFulfilled, onRejected) {
    if (IsCancelablePromise(this) === false) {
      throw new TypeError("CancelablePromise.prototype.then only works on real cancelable promises");
    }

    var newPromise = super.then(onFulfilled, onRejected);

    if (get_slot(this, "[[PromiseState]]") === "pending") {
      newPromise._cancellationParent = this;
      this._childrenCount++;
    }

    return newPromise;
  }

  cancel() {
    if (get_slot(this, "[[PromiseState]]") !== "pending") {
      return;
    }

    let callOnCanceled = false;

    if (this._cancellationParent && get_slot(this._cancellationParent, "[[PromiseState]]") === "pending") {
      this._cancellationParent._childrenCount--;
      if (this._cancellationParent._childrenCount === 0) {
        this._cancellationParent.cancel();
      }
    }
    else {
      callOnCanceled = true;
    }

    this._cancellor();

    if (callOnCanceled && this._onCanceled) {
      this._onCanceled();
    }
  }
}

function IsCancelablePromise(x) {
  if (Type(x) !== "Object") {
    return false;
  }

  if (!('_cancellationParent' in x)) {
    return false;
  }

  return true;
}
