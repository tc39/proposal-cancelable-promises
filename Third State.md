# Canceled as the third state

This document outlines why I think it's important for cancelation to be represented as a third promise state, alongside fulfillment and rejection.

It's important to note that the discussions here are independent of _how_ the promise gets canceled, whether via the "cancelable promise" approach or the "cancel token" approach. The question is more about once a promise gets canceled, how that state is represented and propagates down to any derived promises.

## Against the alternative

The most popular alternative to the third state approach is to represent cancelation as a special type of rejection. This is very awkward in a language like JavaScript, which does not have typed catch guards (and won't for a long time, since this is blocked on pattern matching syntax which is a large proposal nobody has started yet). It leads to a lot of code like

```js
try {
  await fetch(...);
} catch (e) {
  if (!(e instanceof CancelError)) {
    showUserMessage("The site is down and we won't be displaying the pudding recipes you expected.");
  }
} finally {
  stopLoadingSpinner();
}
```

This is because cancelation is not something that is considered an error, or an exceptional circumstance, to either the programmer or the user. The programmer, or their collaborators, are responsible for canceling the async operation in the first place. They don't want to treat it as something unexpected, like an actual failure of the network or similar. Similarly, if the programmer performs cancelation on behalf of a user-initiated action (like navigating away the page before it is loaded), the user doesn't want to be told that the things they no longer care about have now "errored".

In summary, even if we had catch guards, it's a category error to lump cancelation in with other exceptions. Languages with catch guards can get away with this category error, since it is convenient and does not cause much syntactic burden (only conceptual confusion). But since we don't have them in JavaScript, we should instead reserve the `catch` clause for truly exceptional errors, like network failure:

```js
try {
  await fetch(...);
} catch (e) {
  showUserMessage("The site is down and we won't be displaying the pudding recipes you expected.");
} finally {
  stopLoadingSpinner();
}
```

## In support of a state

Despite not being an error, cancelation does have many of the same behaviors as the other two states, with a stronger parallel to rejected.

Once an operation is canceled, any fulfillment or rejection reactions to it are no longer valid. The eventual value will never be available, and the operation won't be given a chance to conclusively fail. So we should remove any fulfillment or rejection handlers, and prune away those paths in the graph of derived promises.

Furthermore, we do want cancelation to "propagate" similarly to how rejection propagates. Once an operation is canceled, all of its descendants in the promise graph (all derived operations) should be considered canceled as well. Nobody is interested in seeing them happen—not because of an exceptional error condition we expect to potentially catch, report, and recover from, but simply because they're now pointless.

## Finally and catching cancelation

As we alluded to in the previous paragraph, one way that cancelation is different from the existing states is how rarely it is appropriate to intercept cancelation specifically. Instead, the much more common thing to do is use `finally` blocks to react to the reality of cancelation—or any other completion—and clean up related resources (such as the `stopLoadingSpinner()` in the example above). From there, the cancelation continues to propagate, tearing down `finally`-bound resources as it goes.

For symmetry, it makes sense to allow handling and recovering from cancelation (or more generally, reactions to cancelation which can then transform into either fulfillment or rejection). But in practice this is expected to be rarely used.

## Completion values, and why this isn't "return"

Promises are in many senses reified completion values, with fulfillment corresponding to normal completion, and rejection to an abrupt throw completion. This parallel becomes more obvious with async/await, where `await`ing a promise in a given state literally causes the corresponding completion to manifest.

There are several other types of completions in the spec, all abrupt: viz. return, break, and throw. At first when investigating cancelation we thought that this third state paralleled the "missing" return abrupt completion (the only non-specialized one remaining). However, this turns out to not be the case.

The reason is that return abrupt completions, unlike throw abrupt completions, do not propagate in the way we want cancelation to propagate. A return abrupt completion is transformed into a normal completion on the function call boundary; it does have the desirable property of skipping the rest of the function, and of triggering any finally blocks, but once it's done so it gets reified into a simple value that can be stored in a variable. To see how this would work, consider the following example, where `returnPromise` is a promise in the hypothetical "returned" state corresponding to a return abrupt completion, with return value `5`:

```js
// HYPOTHETICAL: showing how a "returned state" promise has non-useful behavior

async function inner() {
  try {
    await returnPromise;
    console.log("this will not run");
  } finally {
    console.log("this will run");
  }
}

async function outer() {
  const p = inner();
  // p is a *fulfilled* promise, not a returned promise; return doesn't propagate
  const v = await p;
  console.log("this *will* run, outputting 5: ", v);
}

const p2 = outer();
// Again, p2 is a fulfilled promise (this time with undefined)
```


In contrast, both throw and cancelation completions need to propagate, unwinding the stack so that subsequent work is skipped by not only the caller, but the caller's caller. As such, introducing cancelation is tantamount to introducing a new type of completion value, which is similar to `throw` but is, as explained above, categorically different.

## API design

When introducing the third state, the following modifications to promises fall out rather naturally:

- A new executor argument, allowing the promise creator to move it into this third state: `new Promise((resolve, reject, cancel) => { ... })`. Like `resolve` and `reject`, this accepts an argument, the cancelation reason.
- A new corresponding static method, `Promise.cancel(r)`, which is essentially `new Promise((_, __, cancel) => cancel(r))`.
- A new argument to `Promise.prototype.then`, as the low-level interface for reacting to the third state: `promise.then(onFulfilled, onRejected, onCanceled)`.
- A new helper method, `Promise.prototype.catchCancel`, for reacting to cancelations only: `promise.catchCancel(r => { ... })`.
- A new helper method, `Promise.prototype.finally`, which allows reaction to any of the three states, but will by default propagate the current state (unless you `throw` inside of your finally handler).

Additionally, given the status of cancelation as a new completion record, on par with errors, we'd want to introduce the following modifications to the rest of the language:

- A new syntactic form, `try { ... } catch cancel(r) { ... }`, which catches the new cancelation completion record corresponding to the cancelation state.
- A new syntactic form, `throw cancel r`, which exits the current execution context with one of these new cancelation completion records.
- A new method, `Generator.prototype.cancel(r)`, for causing a generator function's `yield` statement to reify the cancelation completion.

Finally, along the lines of "cancelation is not an error", we probably want to introduce a class analogous to `Error`, called `CancelReason`, which is what is typically used as a cancelation reason.

With these in place, you get complete parity between the states, with syntactic forms for transitioning between them. For example:

```js
const canceledPromise = Promise.resolve().then(() => {
  throw cancel new CancelReason("the user clicked 'stop'");
});

const rejectedPromise = Promise.cancel().catchCancel(() => {
  throw new Error("bad things happened");
});

const fulfilledPromise = Promise.cancel().catchCancel(() => {
  return 5;
});

// Cancelation propagates unless explicitly reacted to:
const canceledPromise2 = Promise.cancel().then(v => { ... }).catch(e => { ... }).finally(() => { ... });
```

### `Promise.prototype.finally` implementation

Since some people are confused and think that `promise.finally(f)` is equivalent to  `promise.then(f, f, f)`, we give a more accurate polyfill here:

```js
Promise.prototype.finally = function (onFinally) {
    return this.then(
        value => this.constructor.resolve(onFinally()).then(() => value),
        exception => this.constructor.resolve(onFinally()).then(() => { throw exception; }),
        reason => this.constructor.resolve(onFinally()).then(() => { throw cancel reason; })
    );
};
```

(This isn't rigorous at a spec-level, in many ways, but serves to illustrate the behavior.) Notably, like a syntactic `finally`, this implementation:

- Does not pass any argument to the reaction code (i.e. to `onFinally`)
- Does not affect the result, i.e. the resulting promise stays fulfilled/rejected/canceled in the same way, *unless*...
- If the reaction code blows up (by `throw`ing/returning a rejected promise or `throw cancel`ing/returning a canceled promise), it propagates that new state onward, instead of the original state.
