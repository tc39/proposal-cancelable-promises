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

doCancelableThing(cancelToken);

// ...later...
cancel();
```

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
  .catch(showUIError)
  .finally(stopSpinner);
```

This latter series of calls could alternately be rewritten in an async function context as

```js
try {
  const response = await fetch("https://example.com/lotsojson.json", { cancelToken });
  const data = await response.json({ cancelToken });
  const text = fetch(data.otherURL, { cancelToken });

  updateUI(text);
} catch (e) {
  showUIError(e);
} finally {
  stopSpinner();
}
```

Note how we reuse the same cancel token for multiple sequential asynchronous operations, thus guaranteeing that if the cancel button is clicked while *any* of them is ongoing, that operation will be canceled.

Note the connection to the canceled "third state". If `fetch()` and `response.json()` are implemented to return a canceled promise once cancelation is requested (as they should be), then canceling during their operation will cause the entire promise chain to pass down the canceled path, skipping any further fulfillment handlers (like `updateUI`) or rejection handlers (like `showUIError`), but causing the finally handler to run.

### For the consumer

For the one performing asynchronous work, who will accept an already-existing cancel token, there are three relevant APIs:

- `cancelToken.requested`, which returns a boolean specifying whether cancelation has been requested (by the creator's associated `cancel` function)
- `cancelToken.promise`, which allows registration for a callback when cancelation is requested
- `cancelToken.cancelIfRequested()`, which will automatically `cancel throw` if cancelation is requested (or do nothing otherwise)

Each of these has specific use cases which we illustrate below

#### Adapting old APIs

The primary use of the `.promise` property is in adapting old APIs which are not cancel-token friendly. (With cancel-token-friendly APIs, you can simply pass them the cancel token). An example is given here of XMLHttpRequest.

```js
function xhrAdapted(url, { cancelToken } = {}) {
  return new Promise((resolve, reject, cancel) => {
    const xhr = new XMLHttpRequest();
    xhr.addEventListener("load", () => resolve(xhr.responseText));
    xhr.addEventListener("error", () => reject(new Error("could not XHR")));

    if (!cancelToken) return;
    cancelToken.promise.then(cancelation => {
      cancel(cancelation);
      xhr.abort();
    });
  });
}
```

A consumer can then use `xhrAdapted` like they do our above `fetch` example, more or less. When they request cancelation (in that example by clicking on `cancelButton`), the `cancelToken.promise` promise will become fulfilled, and so (at the end of the current task, when microtasks run) the promise returned by `xhrAdapted` will become canceled, and `xhr.abort()` will be called.

Another similar example is an adaptation of `setTimeout`:

```js
function delay(ms, cancelToken) {
  return new Promise((resolve, reject, cancel) => {
    const id = setTimeout(resolve, ms);

    if (!cancelToken) return;
    cancelToken.promise.then(cancelation => {
      cancel(cancelation);
      clearTimeout(id);
    });
  });
}
```

#### Use within async functions

The primary use of the `.cancelIfRequested()` API is within async functions that want to provide additional opportunities within their body for cancelation requests to interrupt their flow. First let's see an example where it is _not_ necessary:

```js
async function mockSlowFetch(url, options) {
  await delay(1000, options.cancelToken);
  return fetch(url, options);
}
```

Here we pass the `cancelToken` directly to both `delay` and `fetch`. Any cancelation requests that come in will cause the currently-executing function to cancel, and thus cause `mockSlowFetch` to return a canceled promise. There's no need to insert explicit cancelation points into `mockSlowFetch`.

Let's now consider an example where this is necessary. Let's say that, for some reason, we wanted to generate a bunch of keys using the web crypto API. Let's further assume that key generation is not a cancelable process; perhaps each individual key generation is fast enough that although it needs to be done asynchronously, the overhead of signaling cancelation to the thread in which key generation is taking place is not worth implementing. What we'd like to do is allow cancelation *in between* any key generation operations. To implement that, we would write something like this:

```js
async function generateABunchOfKeys(numKeys, algo, extractable, keyUsages, cancelToken) {
  const keys = [];
  for (let i = 0; i < numKeys; ++i) {
    keys.push(await window.crypto.subtle.generateKey(algo, extractable, keyUsages));
    cancelToken.cancelIfRequested();
  }

  return keys;
}
```

(TODO: this example kind of sucks. I shouldn't be messing with subtle crypto stuff as illustrative examples. And it's better done in parallel anyway, instead of in series.)

In this code, in between each key generation, `generateABunchOfKeys` checks to see if cancelation has been requested by its caller. If so, it'll stop doing any further work, and return a canceled promise: `cancelIfRequested` is equivalent to

```js
if (cancelToken.requested) {
  cancel throw /* the cancelToken's cancelation, i.e. what cancel() was called with */;
}
```
