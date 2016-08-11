# Scratchwork Ideas

Mostly centered around making the API guide people better toward common patterns

## A default no-op cancel token

Pretty much every API that accepts a cancel token wants to accept it optionally. We should make that easy by providing a default no-op cancel token which they can use, e.g. `function f(cancelToken = CancelToken.none)`.

Notably we'd want to avoid this `CancelToken.none.promise` holding a reference to all the handlers registered on it; ideally zero handlers would be registered on it, somehow. I'm not sure if there are any obvious, simple ways to do this. The ways I can think of are:

- Have `CancelToken.none` be a method, so you generate new `CancelToken`s and discard them for each call to the function.
- Have `CancelToken.none.promise` be a special, specced "black hole" promise.
- Have implementers take care of this behind the scenes somehow, since the spec guarantees them the promise handlers will never be called?
