# Cancelable Promises

This is a work-in-progress repository for a proposal for adding cancelable promises to JavaScript. Per the May 2016 TC39 meeting, it is currently at Stage 1, and under heavy development. You can view the in-progress [spec draft](https://domenic.github.io/cancelable-promise/) and take part in the discussions on the [issue tracker](https://github.com/domenic/cancelable-promise/issues).

## Motivation and use cases

In general, many of the async operations undertaken by JavaScript code should be cancelable. That is, the developer should have the ability to request the cessation of any ongoing work, as they no longer care about the result. Examples, many from the web platform, include:

- The [Fetch API](https://fetch.spec.whatwg.org/#fetch-api)
- Every other API that performs a fetch (i.e. loads a resource)
- Canceling an in-progress [animation](https://w3c.github.io/web-animations/)
- Consuming [streams](https://streams.spec.whatwg.org/), such as by [piping them together](https://streams.spec.whatwg.org/#pipe-chains)
- Long-running off-main-thread computational operations (e.g. cryptography)
- Asking the user for permission
- Async [iteration](https://github.com/tc39/proposal-async-iteration) or [observation](https://github.com/zenparsing/es-observable)

The majority of these async operations are already represented by promises, JavaScript's natural asynchronous type. Thus, we seek a mechanism for cancelation that integrates well with promises; we call this "cancelable promises."

The proposal has two main parts: how to represent cancelation, and how to initiate cancelation

## Proposed solution

### Representing cancelation: the "third state"

The idea is that cancelation should be represented as a third (terminal) promise state, alongside fulfilled and rejected. A canceled operation is not "successful" (fulfilled), but it did not "fail" (rejected) either. It is not an exceptional condition for something to be canceled.

The reasoning behind this is gone through in more detail in the [Third State.md][] document. The consequences are:

- Promise additions:
  - `new Promise((resolve, reject, cancel) => { ... })`
  - `Promise.cancel(cancelation)`
  - `promise.then(onFulfilled, onRejected, onCanceled)`
  - `promise.cancelCatch(cancelation => { ... })`
- Promise behavior changes:
  - `Promise.all` will cancel its result upon the first canceled promise in the passed iterable.
  - `Promise.race` will ignore canceled promises in the passed iterable, unless all of the promises become canceled, in which case it will return a promise canceled with an array of cancelations.
- Language additions:
  - `try { ... } cancel catch (cancelation) { ... }`
  - `cancel throw cancelation`
  - `generator.cancelThrow(cancelation)`

An alternative to the third state idea is being explored in [#14](https://github.com/domenic/cancelable-promise/issues/14).

### Initiating cancelation: cancel tokens

Cancel tokens provide a standard way to cancel any API, especially asynchronous ones. The standard usage is:

```js
const cancelToken = new CancelToken(cancel => {
  cancelButton.onclick = () => cancel();
});

performCancelableOperation(cancelToken);
```

although another form is often more convenient:

```js
const { token, cancel } = CancelToken.source();

cancelButton.onclick = () => cancel();
performCancelableOperation(token);
```

The cancel token contains the following APIs, to be used by those authoring potentially-cancelable operations:

- `cancelToken.requested`: a boolean that returns true after the corresponding `cancel()` has been called
- `cancelToken.promise`: a promise that fulfills once cancelation has been requested
- `cancelToken.cancelIfRequested()`: a utility API that performs `cancle throw` for you if cancelation has been requested

The cancel tokens of this proposal are heavily inspired by [Kevin Smith's design sketch](https://github.com/zenparsing/es-cancel-token), which are in turn inspired by the [.NET task cancelation architecture](https://msdn.microsoft.com/en-us/library/dd997396.aspx).
