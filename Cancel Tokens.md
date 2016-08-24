# Cancel Tokens

Cancel tokens are a generic facility for requesting and responding to cancelation. The creator of the cancel token is allowed to request cancelation; the consumer of the cancel token then can respond to these requests.

When used to cancel asynchronous work, the creator is generally the one initiating the asynchronous work (e.g. calling a promise-returning function). The cancel token is then passed as an argument to the procedure that performs the asynchronous work. The receiver of the token can:

- Synchronously check at any time whether cancelation has been requested
- Synchronously throw a cancelation if cancelation has been requested
- Register a callback that will be asynchronously executed once cancelation is requested
- Pass the cancel token to other procedures, if it chooses to do so

Cancel tokens are meant to be used alongside promises, and in particular alongside the [third state](Third State.md), in that an operation that has been canceled via a cancelation token will usually cause its returned promise to transition to the canceled state. However, they can be used in any context involving cooperative cancelation, including e.g. streaming or multi-value operations.

## API Surface

### For the creator

For the one initiating the asynchronous work, the API surface is quite simple. They create the cancelation token, using either the constructor or the `CancelToken.source` convenience factory, and pass it to the cancelable API. Then, they can call the associated cancelation request function at any time.

The `CancelToken` constructor uses the [revealing constructor pattern](https://blog.domenic.me/the-revealing-constructor-pattern/) to grant the cancelation-request capability to its creator, and can be used directly like so:

```js
const cancelToken = new CancelToken(cancel => {
  // store `cancel` for later
});

doCancelableThing(cancelToken);
```

Alternately, if it is not convenient to immediately store (or use) the `cancel` function, you can use the `CancelToken.source` factory:

```js
const { token, cancel } = CancelToken.source();

doCancelableThing(token);

// ...later...
cancel();
```

The `cancel()` function accepts as an argument an optional message, which will be converted to a string. This is used to construct a `Cancel` instance stored by the cancel token, which the consumer can later access (see below).

#### Example

A more serious example of this in action is the following, where we assume various Fetch-related APIs have been modified to accept a cancel token as an option:

```js
const cancelToken = new CancelToken(cancel => {
  cancelButton.onclick = cancel;
});

startSpinner();

fetch("https://example.com/lotsojson.json", { cancelToken })
  .then(response => response.json({ cancelToken }))
  .then(data => fetch(data.otherURL, { cancelToken }))
  .then(text => updateUI(text))
  .else(showUIError)
  .finally(stopSpinner);
```

This latter series of calls could alternately be rewritten in an async function context as

```js
try {
  const response = await fetch("https://example.com/lotsojson.json", { cancelToken });
  const data = await response.json({ cancelToken });
  const text = await fetch(data.otherURL, { cancelToken });

  updateUI(text);
} else (e) {
  showUIError(e);
} finally {
  stopSpinner();
}
```

Note how we reuse the same cancel token for multiple sequential asynchronous operations, thus guaranteeing that if the cancel button is clicked while *any* of them is ongoing, that operation will be canceled.

Note the connection to treating cancelation as a non-error. If `fetch()` and `response.json()` are implemented to return a promise rejected with a `Cancel` instance once cancelation is requested (as they should be), then canceling during their operation will cause the entire promise chain to pass down the canceled path, skipping any further fulfillment handlers (like `updateUI`) or error-only rejection handlers (like `showUIError`), but causing the finally handler to run.

### Combining cancel tokens

Cancel tokens can be combined using the `CancelToken.race` method:

```js
const { token: ct1, cancel: cancel1 } = CancelToken.source();
const { token: ct2, cancel: cancel2 } = CancelToken.source();

const ct3 = CancelToken.race([ct1, ct2]);
```

In this example, if any of `ct1` or `ct2` becomes canceled, `ct3` will become canceled (with the same cancelation). That is, the asserts in what follows will hold:

```js
cancel2("It's a trap!");

console.assert(ct3.requested === true);
ct3.promise.then(cancelation => {
  console.assert(cancelation.message === "It's a trap!");
});
```

This method has precedent in .NET's [`CancellationTokenSource.CreateLinkedTokenSource()`](https://msdn.microsoft.com/en-us/library/dd642252(v=vs.110).aspx) method.

#### Example: "last"

The [last](https://github.com/domenic/last) library is useful in scenarios such as autocompletes or search-on-input to ensure only the most recent result comes back. Its README gives more details on how it works. Here we show how `CancelToken.race` can be used to implement a version of `last` which not only ignores any previous requests, but cancels them.

```js
// Input: a function which takes a cancel token as its final argument
// Output: a function which takes a cancel token as its final argument, safe for repeated calls

function last(operation) {
  let currentSource = CancelToken.source();

  return function (...args) {
    // Cancel the previous call to the operation.
    // On the first call this is a no-op as currentSource.token is unused.
    currentSource.cancel("The operation was called again");

    // Feed the operation a token which will be canceled either if the caller requests
    // (via inputToken) or if we cancel (via the above currentSource.cancel line).
    const inputToken = args.pop();
    currentSource = CancelToken.source();
    const combinedToken = CancelToken.race([inputToken, currentSource.token]);

    return operation.call(this, ...args, combinedToken);
  };
}
```

### For the consumer

For the one performing asynchronous work, who will accept an already-existing cancel token, there are three relevant APIs:

- `cancelToken.requested`, which returns a boolean specifying whether cancelation has been requested (by the creator's associated `cancel` function)
- `cancelToken.promise`, which allows registration for a callback when cancelation is requested, fulfilled with a `Cancel` instance constructed when calling the associated `cancel`
- `cancelToken.throwIfRequested()`, which will automatically `throw` the stored `Cancel` instance if cancelation is requested (or do nothing otherwise)

Each of these has specific use cases which we illustrate below

#### Adapting old APIs

The primary use of the `.promise` property is in adapting old APIs which are not cancel-token friendly. (With cancel-token-friendly APIs, you can simply pass them the cancel token). An example is given here of XMLHttpRequest.

```js
function xhrAdapted(url, { cancelToken } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => resolve(xhr.responseText));
    xhr.addEventListener("error", () => reject(new Error("could not XHR")));

    if (!cancelToken) return;
    cancelToken.promise.then(cancelation => {
      reject(cancelation);
      xhr.abort();
    });
  });
}
```

A consumer can then use `xhrAdapted` like they do our above `fetch` example, more or less. When they request cancelation (in that example by clicking on `cancelButton`), the `cancelToken.promise` promise will become fulfilled, and so (at the end of the current task, when microtasks run) the promise returned by `xhrAdapted` will become canceled, and `xhr.abort()` will be called.

Another similar example is an adaptation of `setTimeout`:

```js
function delay(ms, cancelToken) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);

    if (!cancelToken) return;
    cancelToken.promise.then(cancelation => {
      reject(cancelation);
      clearTimeout(id);
    });
  });
}
```

This boilerplate can be repetitive, so the spec has a helper function, `Promise.withCancelToken`, that allows you to write it more simply. Using our XHR example, it becomes

```js
function xhrAdapted(url, { cancelToken } = {}) {
  return Promise.withCancelToken(cancelToken, (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => resolve(xhr.responseText));
    xhr.addEventListener("error", () => reject(new Error("could not XHR")));

    return () => xhr.abort();
  });
}
```

For reference, the rough equivalent of the `Promise.withCancelToken` spec is maintained [in the repository](with-cancel-token.js).

#### Basic usage within async functions

The primary use of the `.throwIfRequested()` API is within async functions that want to provide additional opportunities within their body for cancelation requests to interrupt their flow. First let's see an example where it is _not_ necessary:

```js
async function mockSlowFetch(url, options) {
  await delay(1000, options.cancelToken);
  return fetch(url, options);
}
```

Here we pass the `cancelToken` directly to both `delay` and `fetch`. Any cancelation requests that come in will cause the currently-executing function to cancel, and thus cause `mockSlowFetch` to return a canceled promise. There's no need to insert explicit cancelation points into `mockSlowFetch`.

Let's now consider an example where this is necessary. Let's say that we have some moderately-expensive operation that does not support cancelation, for example reading from a data bus. Let's further say that we'd like to keep performing this operation, ad infinitum, until either we are canceled or until we receive a specific target value. And, let's say that we want to wait 1 second between reading from the data bus, in order to conserve bus resources. One way to write this would be

```js
async function pollForValue(bus, targetValue, cancelToken) {
  while (true) {
    const answer = await bus.read();

    if (answer === targetValue) {
      return;
    }

    cancelToken.throwIfRequested();
    await delay(1000, cancelToken);
  }
}
```

In this case, the `pollForValue` function provides a cancelation opportunity after every read from the bus, via the manually-inserted `throwIfRequested()` point, as well as during the 1 second pause.

#### Advanced usage within async functions: `await.cancelToken`

In the above example, we manually inserted a `cancelToken.throwIfRequested()` after every call to `bus.read()`. For a function with a series of uncancelable operations, this can get quite unwieldy:

```js
async function cancelMeA(cancelToken) {
  doSyncThing();
  cancelToken.throwIfRequested();
  await doAsyncUncancelableThing1();
  cancelToken.throwIfRequested();
  await doAsyncUncancelableThing2();
}
```

Additionally, the above pattern allows less cancelation opportunities than it could: you have to wait for the operations `doAsyncUncancelableThing1()` or `doAsyncUncancelableThing2()` to fulfill, before a cancelation can have any effect. A pattern which is probably better in most cases is

```js
async function cancelMeB(cancelToken) {
  doSyncThing();

  await Promise.race([
    doAsyncUncancelableThing1(),
    cancelToken.promise.then(c => { throw c; })
  ]);

  await Promise.race([
    doAsyncUncancelableThing2(),
    cancelToken.promise.then(c => { throw c; })
  ]);
}
```

In this variation, if `cancelToken` becomes canceled at any time, the result of the `await` expression will be a promise rejected with the cancel token's `Cancel` object, and thus the async function as a whole will immediately bail out and return a canceled promise.

To be concrete, if `doAsyncUncancelableThing1` takes 10 seconds, but you call `cancelToken`'s associated `cancel()` function after 5 seconds, then the promise returned by `cancelMeB()` will be canceled after 5 seconds. In contrast, under a similar scenario, `cancelMeA()`'s return value will only become canceled after 10 seconds, once the first `await` point has passed.

Of course, both the interleaved and race patterns are unwieldly. There is a syntactic shortcut for the race pattern which makes this all much easier:

```js
async function cancelMeC(cancelToken) {
  await.cancelToken = cancelToken;

  doSyncThing();
  await doAsyncUncancelableThing1();
  await doAsyncUncancelableThing2();
}
```

The function `cancelMeC` has equivalent behavior to `cancelMeB`, but is much easier to read and write.
