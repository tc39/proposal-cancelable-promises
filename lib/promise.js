const { Call, EnqueueJob, Get, Invoke, IsCallable, IsConstructor, SameValue, SpeciesConstructor, Type }
  = require("especially/abstract-operations");
const { assert, get_slot, has_slot, make_slots, set_slot } = require("especially/meta");
const { "@@species": atAtSpecies } = require("especially/well-known-symbols");

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
    Cancel: () => {
      if (alreadyResolved === true) {
        return;
      }

      alreadyResolved = true;

      return CancelPromise(promise);
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

function CancelPromise(promise) {
  assert(get_slot(promise, "[[PromiseState]]") === "pending");

  const reactions = get_slot(promise, "[[PromiseCancelReactions]]");

  set_slot(promise, "[[PromiseFulfillReactions]]", undefined);
  set_slot(promise, "[[PromiseRejectReactions]]", undefined);
  set_slot(promise, "[[PromiseCancelReactions]]", undefined);
  set_slot(promise, "[[PromiseState]]", "canceled");

  return TriggerPromiseReactions(promise, reactions, undefined);
}

export function NewPromiseCapability(C) {
  if (IsConstructor(C) === false) {
    throw new TypeError("NewPromiseCapability only works on constructors");
  }

  const promiseCapability = { Promise: undefined, Resolve: undefined, Reject: undefined, Cancel: undefined };
  const executor = (resolve, reject, cancel) => {
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

  const promise = new C(executor);

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

export function TriggerPromiseReactions(promise, reactions, argument) {
  for (const reaction of reactions) {
    EnqueueJob("PromiseJobs", PromiseReactionJob, [reaction, argument]);
  }

  return undefined;
}

function PromiseReactionJob(reaction, argument) {
  const promiseCapability = reaction.Capabilities;
  const handler = reaction.Handler;

  // This section is hard to transliterate from the spec due to completion values.
  // So this is just the equivalent in ES, instead.
  if (handler === "Identity") {
    Call(promiseCapability.Resolve, undefined, [argument]);
  } else if (handler === "Thrower") {
    Call(promiseCapability.Reject, undefined, [argument]);
  } else {
    let handlerResult = undefined;
    let threw = false;
    try {
      handlerResult = Call(handler, undefined, [argument]);
    } catch (callE) {
      threw = true;
      Call(promiseCapability.Reject, undefined, [callE]);
    }

    if (!threw) {
      Call(promiseCapability.Resolve, undefined, [handlerResult]);
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

export default class Promise {
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

    const S = Get(C, atAtSpecies);
    if (S !== undefined && S !== null) {
      C = S;
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

    const S = Get(C, atAtSpecies);
    if (S !== undefined && S !== null) {
      C = S;
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

    const S = Get(C, atAtSpecies);
    if (S !== undefined && S !== null) {
      C = S;
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

    const S = Get(C, atAtSpecies);
    if (S !== undefined && S !== null) {
      C = S;
    }

    const promiseCapability = NewPromiseCapability(C);
    Call(promiseCapability.Resolve, undefined, [x]);
    return promiseCapability.Promise;
  }

  static get [atAtSpecies]() {
    return this;
  }

  catch(onRejected) {
    return Invoke(this, "then", [undefined, onRejected]);
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

export function PerformPromiseThen(promise, onFulfilled, onRejected, onCanceled, resultCapability) {
  assert(IsPromise(promise) === true);

  if (IsCallable(onFulfilled) === false) {
    onFulfilled = "Identity";
  }

  if (IsCallable(onRejected) === false) {
    onRejected = "Thrower";
  }

  if (IsCallable(onCanceled) === false) {
    onCanceled = "Identity";
  }

  const fulfillReaction = { Capabilities: resultCapability, Handler: onFulfilled };
  const rejectReaction = { Capabilities: resultCapability, Handler: onRejected };
  const cancelReaction = { Capabilities: resultCapability, Handler: onCanceled };

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
    EnqueueJob("PromiseJobs", PromiseReactionJob, [cancelReaction, undefined]);
  }

  return resultCapability.Promise;
}
