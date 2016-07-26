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

### Representing cancelation: an exception that is not an error

A canceled operation is not "successful", but it did not really "fail" either. We want cancelation to propagate in the same way as an exception, but it is not an error.

In order for this proposal to gain consensus, cancelations must be caught by `catch` blocks; we cannot treat cancelations as a new completion type which skips `catch` blocks and only triggers `finally`. However, it's important that they be distinguished objects which are in general treated differently. Top-level error handling and unhandled promise rejection tracking should ignore cancelations, and it should be syntactically easy to catch everything _but_ cancelations.

The reasoning behind this is spelled out in more detail in the ["Not an Error"](Not an Error.md) document. This proposal concretely includes:

- A new class, `Cancel`, which does not derive from `Error`.
- Special-case handling of `Cancel` instances in both [synchronous error reporting](https://tc39.github.io/ecma262/#sec-host-report-errors) and [asynchronous rejection tracking](https://tc39.github.io/ecma262/#sec-host-promise-rejection-tracker)
- New syntax, `try { ... } else (e) { ... }`, which ignores instances of `Cancel`.
- A new Promise method, `promise.else(onRejected)`, which ignores instances of `Cancel`.

### Initiating cancelation: cancel tokens

Cancel tokens provide a standard way to cancel any API, especially asynchronous ones. The standard usage is:

```js
const cancelToken = new CancelToken(cancel => {
  cancelButton.onclick = () => cancel("The cancel button was clicked");
});

performCancelableOperation(cancelToken);
```

The cancel tokens of this proposal are heavily inspired by [Kevin Smith's design sketch](https://github.com/zenparsing/es-cancel-token), which are in turn inspired by the [.NET task cancelation architecture](https://msdn.microsoft.com/en-us/library/dd997396.aspx). They are discussed further, in much more detail, in ["Cancel Tokens"](Cancel Tokens.md).
