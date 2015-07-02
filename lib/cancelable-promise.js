const { SpeciesConstructor, Type, Call } = require("especially/abstract-operations");
const { get_slot, set_slot } = require("especially/meta");
import { default as Promise, NewPromiseCapability, PerformPromiseThen, TriggerPromiseReactions } from "./promise.js";

export default class CancelablePromise extends Promise {
  constructor(executor) {
    let superResolve, superReject;
    super((resolve, reject) => {
      superResolve = resolve;
      superReject = reject;
    });

    this._cancellationParent = null;
    this._childrenCount = 0;

    const resolvingFunctions = CreateCancelableResolvingFunctions(this, superResolve, superReject);

    try {
      this._onCanceled = executor(resolvingFunctions.Resolve, resolvingFunctions.Reject);
    } catch (completionE) {
      resolvingFunctions.Reject(completionE);
    }
  }

  then(onFulfilled, onRejected) {
    const promise = this;
    if (IsCancelablePromise(this) === false) {
      throw new TypeError("CancelablePromise.prototype.then only works on real cancelable promises");
    }

    const C = SpeciesConstructor(promise, CancelablePromise);
    const resultCapability = NewPromiseCapability(C);
    const newPromise = PerformPromiseThen(promise, onFulfilled, onRejected, resultCapability);

    if (get_slot(this, "[[PromiseState]]") === "canceled") {
      set_slot(newPromise, "[[PromiseState]]", "canceled");
    }
    else if (get_slot(this, "[[PromiseState]]") === "pending") {
      newPromise._cancellationParent = promise;
      promise._childrenCount++;
    }

    return newPromise;
    // TODO: decide if `() => this.cancel()` is correct, i.e., should we go through the public interface? Probably.
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

    set_slot(this, "[[PromiseState]]", "canceled");

    if (callOnCanceled && this._onCanceled) {
      this._onCanceled();
    }

    TriggerPromiseReactions(this, [], undefined);
  }
}

function CreateCancelableResolvingFunctions(promise, resolve, reject) {
  // This function will probably mutate to have custom resolving functions that use the spec abstract operations
  // directly, instead of wrapping the original resolve/reject. But for now this suffices.
  return {
    Resolve: v => {
      if (get_slot(promise, "[[PromiseState]]") == "canceled") {
        return;
      }
      resolve(v);
    },
    Reject: r => {
      if (get_slot(promise, "[[PromiseState]]") == "canceled") {
        return;
      }
      reject(r);
    }
  };
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
