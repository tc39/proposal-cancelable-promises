"use strict";
const Call = require("especially/abstract-operations").Call;
const EnqueueJob = require("especially/abstract-operations").EnqueueJob;
const Get = require("especially/abstract-operations").Get;
const Invoke = require("especially/abstract-operations").Invoke;
const IsCallable = require("especially/abstract-operations").IsCallable;
const IsConstructor = require("especially/abstract-operations").IsConstructor;
const SameValue = require("especially/abstract-operations").SameValue;
const Type = require("especially/abstract-operations").Type;
const assert = require("especially/meta").assert;
const get_slot = require("especially/meta").get_slot;
const has_slot = require("especially/meta").has_slot;
const make_slots = require("especially/meta").make_slots;
const set_slot = require("especially/meta").set_slot;

// SWEETJS HACK AHOY:
// SweetJS's parser converts `class C { [atAtSpecies]() { } }` into `class C { atAtSpecies() { } }`.
// So, we'll need to re-do all species-related mechanisms to just use the string-valued property "atAtSpecies".

function SpeciesConstructor(O, defaultConstructor) {
    assert(Type(O) === "Object");

    const C = Get(O, "constructor");
    if (C === undefined) {
        return defaultConstructor;
    }
    if (Type(C) !== "Object") {
        throw new TypeError("Tried to get species but the constructor property was not an object.");
    }

    const S = Get(C, "atAtSpecies");
    if (S === undefined || S === null) {
        return defaultConstructor;
    }

    if (IsConstructor(S) === true) {
        return S;
    }

    throw new TypeError("Result of getting species was a non-constructor.");
}

function IfAbruptRejectPromise(value, capability) {
  // Usage: pass it exceptions; it only handles that case.
  // Always use `return` before it, i.e. `try { ... } catch (e) { return IfAbruptRejectPromise(e, capability); }`.
  capability.reject(value);
  return capability.promise;
}

function CreateResolvingFunctions(promise) {
  let alreadyResolved = false;

  return {
    Resolve: resolution => {
      if (alreadyResolved === true) {
        return;
      }

      alreadyResolved = true;

      if (SameValue(resolution, promise) === true) {
        const selfResolutionError = new TypeError("self resolution");
        return RejectPromise(promise, selfResolutionError);
      }

      if (Type(resolution) !== "Object") {
        return FulfillPromise(promise, resolution);
      }

      let thenAction;
      try {
        thenAction = Get(resolution, "then");
      } catch (thenActionE) {
        return RejectPromise(promise, thenActionE);
      }

      if (IsCallable(thenAction) === false) {
        return FulfillPromise(promise, resolution);
      }

      EnqueueJob("PromiseJobs", PromiseResolveThenableJob, [promise, resolution, thenAction]);
    },
    Reject: reason => {
      if (alreadyResolved === true) {
        return undefined;
      }

      alreadyResolved = true;

      return RejectPromise(promise, reason);
    },
    Cancel: reason => {
      if (alreadyResolved === true) {
        return;
      }

      alreadyResolved = true;

      return CancelPromise(promise, reason);
    }
  };
}

function FulfillPromise(promise, value) {
  assert(get_slot(promise, "[[PromiseState]]") === "pending");

  const reactions = get_slot(promise, "[[PromiseFulfillReactions]]");

  set_slot(promise, "[[PromiseResult]]", value);
  set_slot(promise, "[[PromiseFulfillReactions]]", undefined);
  set_slot(promise, "[[PromiseRejectReactions]]", undefined);
  set_slot(promise, "[[PromiseCancelReactions]]", undefined);
  set_slot(promise, "[[PromiseState]]", "fulfilled");

  return TriggerPromiseReactions(promise, reactions, value);
}

function CancelPromise(promise, reason) {
  assert(get_slot(promise, "[[PromiseState]]") === "pending");

  const reactions = get_slot(promise, "[[PromiseCancelReactions]]");

  set_slot(promise, "[[PromiseResult]]", reason);
  set_slot(promise, "[[PromiseFulfillReactions]]", undefined);
  set_slot(promise, "[[PromiseRejectReactions]]", undefined);
  set_slot(promise, "[[PromiseCancelReactions]]", undefined);
  set_slot(promise, "[[PromiseState]]", "canceled");

  return TriggerPromiseReactions(promise, reactions, reason);
}

function NewPromiseCapability(C) {
  if (IsConstructor(C) === false) {
    throw new TypeError("NewPromiseCapability only works on constructors");
  }

  const promiseCapability = { Promise: undefined, Resolve: undefined, Reject: undefined, Cancel: undefined };
  const getCapabilitiesExecutor = (resolve, reject, cancel) => {
    if (promiseCapability.Resolve !== undefined) {
      throw new TypeError("Promise capability must not have [[Resolve]] set when calling executor");
    }
    if (promiseCapability.Reject !== undefined) {
      throw new TypeError("Promise capability must not have [[Reject]] set when calling executor");
    }
    if (promiseCapability.Cancel !== undefined) {
      throw new TypeError("Promise capability must not have [[Cancel]] set when calling executor");
    }

    promiseCapability.Resolve = resolve;
    promiseCapability.Reject = reject;
    promiseCapability.Cancel = cancel;

    return undefined;
  };

  const promise = new C(getCapabilitiesExecutor);

  if (IsCallable(promiseCapability.Resolve) === false) {
    throw new TypeError("The given constructor did not correctly set a [[Resolve]] function on the promise capability");
  }
  if (IsCallable(promiseCapability.Reject) === false) {
    throw new TypeError("The given constructor did not correctly set a [[Reject]] function on the promise capability");
  }
  if (IsCallable(promiseCapability.Cancel) === false) {
    throw new TypeError("The given constructor did not correctly set a [[Cancel]] function on the promise capability");
  }

  promiseCapability.Promise = promise;
  return promiseCapability;
}

function IsPromise(x) {
  if (Type(x) !== "Object") {
    return false;
  }

  if (!has_slot(x, "[[PromiseState]]")) {
    return false;
  }

  return true;
}

function RejectPromise(promise, reason) {
  assert(get_slot(promise, "[[PromiseState]]") === "pending");

  const reactions = get_slot(promise, "[[PromiseRejectReactions]]");

  set_slot(promise, "[[PromiseResult]]", reason);
  set_slot(promise, "[[PromiseFulfillReactions]]", undefined);
  set_slot(promise, "[[PromiseRejectReactions]]", undefined);
  set_slot(promise, "[[PromiseCancelReactions]]", undefined);
  set_slot(promise, "[[PromiseState]]", "rejected");

  return TriggerPromiseReactions(promise, reactions, reason);
}

function TriggerPromiseReactions(promise, reactions, argument) {
  for (const reaction of reactions) {
    EnqueueJob("PromiseJobs", PromiseReactionJob, [reaction, argument]);
  }

  return undefined;
}

function PromiseReactionJob(reaction, argument) {
  const handler = reaction.Handler;

  // This section is hard to transliterate from the spec due to completion values.
  // So this is just the equivalent in ES, instead.
  if (handler === "Identity") {
    Call(reaction.DefaultReaction, undefined, [argument]);
  } else if (handler === "Thrower") {
    Call(reaction.ThrowReaction, undefined, [argument]);
  } else if (handler === "Canceler") {
    Call(reaction.CancelReaction, undefined, [argument]);
  } else {
    let handlerResult = undefined;
    let threw = false;
    try {
      handlerResult = Call(handler, undefined, [argument]);
    } catch cancel(callCE) {
      threw = true;
      Call(reaction.CancelReaction, undefined, [callCE]);
    } catch (callE) {
      threw = true;
      Call(reaction.ThrowReaction, undefined, [callE]);
    }

    if (!threw) {
      Call(reaction.DefaultReaction, undefined, [handlerResult]);
    }
  }
}

function PromiseResolveThenableJob(promiseToResolve, thenable, then) {
  const resolvingFunctions = CreateResolvingFunctions(promiseToResolve);

  try {
    Call(then, thenable, [resolvingFunctions.Resolve, resolvingFunctions.Reject, resolvingFunctions.Cancel]);
  } catch (thenCallResultE) {
    Call(resolvingFunctions.Reject, undefined, [thenCallResultE]);
  }
}

module.exports = class Promise {
  constructor(executor) {
    if (IsCallable(executor) === false) {
      throw new TypeError("executor must be callable");
    }

    // Cheating a bit on NewTarget stuff here.

    const promise = this;
    make_slots(promise, ["[[PromiseState]]", "[[PromiseConstructor]]", "[[PromiseResult]]",
      "[[PromiseFulfillReactions]]", "[[PromiseRejectReactions]]", "[[PromiseCancelReactions]]"]);

    set_slot(promise, "[[PromiseConstructor]]", this.constructor);
    set_slot(promise, "[[PromiseState]]", "pending");
    set_slot(promise, "[[PromiseFulfillReactions]]", []);
    set_slot(promise, "[[PromiseCancelReactions]]", []);
    set_slot(promise, "[[PromiseRejectReactions]]", []);

    const resolvingFunctions = CreateResolvingFunctions(promise);

    try {
      Call(executor, undefined, [resolvingFunctions.Resolve, resolvingFunctions.Reject, resolvingFunctions.Cancel]);
    } catch (completionE) {
      Call(resolvingFunctions.Reject, undefined, [completionE]);
    }

    return promise;
  }

  static all(iterable) {
    let C = this;

    if (Type(C) !== "Object") {
      throw new TypeError("Promise.all must be called on an object");
    }

    // The algorithm and indirection here, with PerformPromiseAll, manual iteration, and the closure-juggling, is just
    // too convoluted compared to normal ES code, so let's skip it. The following should be equivalent; it maintains
    // some of the formal translation in places, but skips on some of the structure.

    return new C((resolve, reject) => {
      const values = [];

      let remainingElementsCount = 1;
      let index = 0;

      for (const nextValue of iterable) {
        values.push(undefined);
        const nextPromise = Invoke(C, "resolve", [nextValue]);

        let alreadyCalled = false;
        const resolveElement = x => {
          if (alreadyCalled === true) {
            return undefined;
          }
          alreadyCalled = true;
          values[index] = x;

          remainingElementsCount = remainingElementsCount - 1;
          if (remainingElementsCount === 0) {
            resolve(values);
          }
        };

        remainingElementsCount = remainingElementsCount + 1;

        Invoke(nextPromise, "then", [resolveElement, reject]);

        index = index + 1;
      }
    });
  }

  static race(iterable) {
    let C = this;

    if (Type(C) !== "Object") {
      throw new TypeError("Promise.race must be called on an object");
    }

    // Similarly to for `Promise.all`, we avoid some of the indirection here.

    return new C((resolve, reject) => {
      for (const nextValue of iterable) {
        const nextPromise = Invoke(C, "resolve", [nextValue]);
        Invoke(nextPromise, "then", [resolve, reject]);
      }
    });
  }

  static reject(r) {
    let C = this;

    if (Type(C) !== "Object") {
      throw new TypeError("Promise.reject must be called on an object");
    }

    const promiseCapability = NewPromiseCapability(C);
    Call(promiseCapability.Reject, undefined, [r]);
    return promiseCapability.Promise;
  }

  static resolve(x) {
    let C = this;

    if (Type(C) !== "Object") {
      throw new TypeError("Promise.resolve must be called on an object");
    }

    const promiseCapability = NewPromiseCapability(C);
    Call(promiseCapability.Resolve, undefined, [x]);
    return promiseCapability.Promise;
  }

  static cancel(r) {
    let C = this;

    if (Type(C) !== "Object") {
      throw new TypeError("Promise.cancel must be called on an object");
    }

    const promiseCapability = NewPromiseCapability(C);
    Call(promiseCapability.Cancel, undefined, [r]);
    return promiseCapability.Promise;
  }

  static get atAtSpecies() {
    return this;
  }

  catch(onRejected) {
    return Invoke(this, "then", [undefined, onRejected]);
  }

  catchCancel(onCanceled) {
    return Invoke(this, "then", [undefined, undefined, onCanceled]);
  }

  then(onFulfilled, onRejected, onCanceled) {
    const promise = this;
    if (IsPromise(this) === false) {
      throw new TypeError("Promise.prototype.then only works on real promises");
    }

    const C = SpeciesConstructor(promise, Promise);
    const resultCapability = NewPromiseCapability(C);
    return PerformPromiseThen(promise, onFulfilled, onRejected, onCanceled, resultCapability);
  }
}

function PerformPromiseThen(promise, onFulfilled, onRejected, onCanceled, resultCapability) {
  assert(IsPromise(promise) === true);

  if (IsCallable(onFulfilled) === false) {
    onFulfilled = "Identity";
  }

  if (IsCallable(onRejected) === false) {
    onRejected = "Thrower";
  }

  if (IsCallable(onCanceled) === false) {
    onCanceled = "Canceler";
  }

  const fulfillReaction = {
    Handler: onFulfilled,
    DefaultReaction: resultCapability.Resolve,
    ThrowReaction: resultCapability.Reject,
    CancelReaction: resultCapability.Cancel
  };
  const rejectReaction = {
    Handler: onRejected,
    DefaultReaction: resultCapability.Resolve,
    ThrowReaction: resultCapability.Reject,
    CancelReaction: resultCapability.Cancel
  };
  const cancelReaction = {
    Handler: onCanceled,
    DefaultReaction: resultCapability.Resolve,
    ThrowReaction: resultCapability.Reject,
    CancelReaction: resultCapability.Cancel
  };

  if (get_slot(promise, "[[PromiseState]]") === "pending") {
    get_slot(promise, "[[PromiseFulfillReactions]]").push(fulfillReaction);
    get_slot(promise, "[[PromiseRejectReactions]]").push(rejectReaction);
    get_slot(promise, "[[PromiseCancelReactions]]").push(cancelReaction);
  } else if (get_slot(promise, "[[PromiseState]]") === "fulfilled") {
    const value = get_slot(promise, "[[PromiseResult]]");
    EnqueueJob("PromiseJobs", PromiseReactionJob, [fulfillReaction, value]);
  } else if (get_slot(promise, "[[PromiseState]]") === "rejected") {
    const reason = get_slot(promise, "[[PromiseResult]]");
    EnqueueJob("PromiseJobs", PromiseReactionJob, [rejectReaction, reason]);
  } else if (get_slot(promise, "[[PromiseState]]") === "canceled") {
    const reason = get_slot(promise, "[[PromiseResult]]");
    EnqueueJob("PromiseJobs", PromiseReactionJob, [cancelReaction, reason]);
  }

  return resultCapability.Promise;
}
