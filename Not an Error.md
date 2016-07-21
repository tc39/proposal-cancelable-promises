# Treating cancelations as non-errors

This document outlines why it's important that cancelations are given special treatment as a type of exception that is treated specially by the rest of the language, as a non-error. (Here we use the word "exception" to mean any value which is `throw`n, whereas an "error" is the more fuzzy concept of some failure in the program.)

The discussions here are independent of _how_ the promise gets canceled, whether via a "task" subclass approach (as previously contemplated) or via the "cancel token" approach (as the rest of this repository assumes). The question is more about once a promise gets canceled, how that state is represented and propagates throughout the rest of the program.

Many of the arguments here were previously used to [argue for a third promise state](https://github.com/domenic/cancelable-promise/blob/2f601acb3d4d438be0ebc9e4e54e6febde9d7a3a/Third%20State.md). However, that proposal was unable to gain consensus, largely due to implementation pushback against a new completion type, as well as concerns about how legacy code would not be able to deal with nonlocal exits that could not be prevented by `catch` blocks.

## The pain of treating cancelation as an error

Treating cancelation as an error is very awkward in a language like JavaScript, which does not have typed catch guards (and won't for a long time, since this is blocked on pattern matching syntax which is a large proposal nobody has started yet). It leads to a lot of code like

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

This kind of code ends up being necessary because to both the programmer and the user, cancelation is not a failure condition. The programmer is responsible for canceling the async operation in the first place. They don't want to treat it as something unexpected, like an actual failure of the network or similar. Similarly, if the programmer performs cancelation on behalf of a user-initiated action (like navigating away the page before it is loaded), the user doesn't want to be told that the things they no longer care about have now "errored".

There is some anecdata available to emphasize the pain of this conflation of cancelations and errors. C# chose a cancelation architecture very similar to the one proposed in this repository, but without addressing this problem: they simply used a `TaskCanceledException` to represent cancelations. @benjamingr gives his experience with the pain this caused [in a comment](https://github.com/domenic/cancelable-promise/issues/14#issuecomment-227671239):

> `catch` catching cancellations has been a major pain point in C# - your worker goes down because a cancellation token told it to and all your logging and metric infrastructure starts going wild at night.
>
> You end up having to do `catch(Exception e) when (e is not TaskCancelledException)` all over the place and be ready to **wake up in the middle of the night for a false downtime alarm when you get an SMS with 1000 server errors which are not really errors** - Azure just updates the OS of the workers one by one and each triggered 10 cancellations.

It seems imperative that we try to avoid waking people up in the middle of the night with false downtime alarms 😊.

By searching code for `TaskCancelledException`, you can find instances where people have to write this kind of filtering code. Here are a few we have found: [1](https://github.com/FubarDevelopment/FtpServer/blob/343cfc05a9a53de28640758236728b9257e874fe/FubarDev.FtpServer/BackgroundTransferWorker.cs#L161), [2](https://github.com/WinDevInd/WinTPL/blob/226af4e62ab893ee4cca8d38b04bc179a1bf1f0f/TaskParams.cs#L98-L101), [3](http://stackoverflow.com/q/29825066/3191), [4](https://github.com/IdentityServer/IdentityServer3/issues/1564).

## Making it easy to treat cancelations as non-errors

Even if we had catch guards, we emphasize that it is a category error to lump cancelation in with other errors. For consensus-seeking reasons, we cannot modify the behavior of `catch`. Instead, we introduce the `try ... else` construct, which in many ways is "the new `catch`". It allows the developer to replace the above manual filtering with the simpler and easy to read

```js
try {
  await fetch(...);
} else (e) {
  showUserMessage("The site is down and we won't be displaying the pudding recipes you expected.");
} finally {
  stopLoadingSpinner();
}
```

## Unhandled cancelation

One of the major differences between cancelations and errors is what happens once each propagates up the entire (sync or async) call stack, to the top level where no derivedstack frames or promise are created. That is, compare:

```js
startSpinner();
const fetchPromise = doNetworkRequestAgainstMockServer();
const derivedPromise = fetchPromise.then(() => {
  doSomeeething(); // oops, typo
}).finally(stopSpinner);

// will cause fetchPromise to cancel, thus derivedPromise will be rejected with a cancelation
cancelButton.onclick = () => cancelNetworkRequestSomehow();

// will cause fetchPromise to fulfill, thus derivedPromise will be rejected with an error
respondButton.onclick = () => causeMockServerToRespond();
```

If the user clicks the `cancelButton`, causing the top-level `derivedPromise` to be rejected with a cancelation, this is a non-event. The `finally` code will run, and then nothing else should happen: we initiated a cancelation with the expectation that nothing after the cancelation matters.

In contrast, if the user clicks the `respondButton` and `fetchPromise` fulfills, the top-level `derivedPromise` will reject, due to the typo. The `finally` code will still run, and so cleanup will happen as appropriate—but we now have that most terrible of things, an _unhandled rejection_. This unhandled rejection needs to be surfaced, through developer tools and [application-facing events](https://html.spec.whatwg.org/#unhandled-promise-rejections). Whereas the "unhandled cancelation" is not an error at all, and there is no need for tools to collate such occurrences.

This is, of course, all a consequence of our central thesis: _cancelation is not an error, and should not go through an error channel_. The same reasoning applies to the synchronous analog; any cancelations that synchronously bubble to the top of the stack should not be reported to the host environment.

## Why modeling cancelation as an exception type works

Despite not being an error, cancelation does have many of the same behaviors as a thrown exception or a promise rejection.

Once an operation is canceled, any fulfillment or rejection reactions to it are no longer valid. The eventual value will never be available, and the operation won't be given a chance to conclusively fail. So we should remove any fulfillment or failure handlers, and prune away those paths in the graph of derived promises.

Furthermore, we do want cancelation (i.e. rejection with a cancelation object) to "propagate" similarly to how rejection with an error propagates. Once an operation is canceled, all of its descendants in the promise graph (all derived operations) should be considered canceled as well. Nobody is interested in seeing them happen—not because of an error condition we expect to potentially catch, report, and recover from, but simply because they're now pointless.

## API design

The main new API introduced to support this conception of cancelation as a non-error is a new type, which we call `Cancel`. (It might have been called `Cancelation`, but that is longer to type, and causes confusion on the subject of how many "L"s to include.) It is used as follows:

```js
throw Cancel("optional message");
```

The `Cancel` type is not a subclass of `Error`, and (except in having an own property named `message`) it does not emulate the pattern of `Error` subclasses: it has no `name` or `message` prototype properties, and it is not expected to include the (currently nonstandard) `stack` getter.

It _does_ borrow the convenience feature from `Error` and friends of not requiring `new` to be constructed, both for brevity and since people are somewhat used to the sequence `throw X()` instead of `throw new X()`. (This is an optional part of the proposal, but I think it's nice.)

`Cancel` objects are branded with an internal slot. `try ... else` constructs (and the counterpart `Promise.prototype.else`) use this brand to not catch `Cancel` objects. Host error reporting and unhandled rejection tracking mechanisms use it to ignore `Cancel` objects.

With this in place, you have all the tools necessary to treat cancelations as non-errors. For example:

```js
const canceledPromise = Promise.resolve().then(() => {
  throw Cancel("the user clicked 'stop'");
});

// Cancelation propagates unless explicitly reacted to:
const canceledPromise2 = canceledPromise().then(v => {
  // will not be called
})
.else(e => {
  // will not be called
})
.finally(() => {
 // will be called
});

// Cancelation will not reach the unhandled rejection callback:
window.addEventListener("unhandledrejection", e => {
  // will not be called
});
```
