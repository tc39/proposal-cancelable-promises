_STATUS: this document ended up being more of a scratchpad than a good introduction to the subject. It needs significant reorganization to present the concepts in a comprehensible manner. Not really recommended reading yet._

# Brainstorming about a `Task` subclass

This document builds on the arguments for "Canceled as a third state", constraining ourselves to solutions which do not modify the base `Promise` type any further than is done in that exploration. Instead, further capabilities—such as the ability for an async action to be canceled by parties besides the promise creator—are given to a subclass.

## Problem statement

We would like to be able to design APIs, such as `fetch` or a promise-based version of `setTimeout`, that give you an easy way to both extract an eventual result, and to cancel the process of obtaining that eventual result. The former is provided by a promise return value; the latter is the new ingredient. (Obviously once the result is canceled, the returned promise should transition to the canceled state.)

An inelegant way to do this is to change the APIs to return `{ promise, cancel }` objects. The biggest problem with this is that it prevents transparent upgrades from non-cancelable APIs to cancelable ones, which is generally desirable (`fetch` being a prime example). It is also awkward to compose with other promise consumers, requiring appending a `.promise` to access the _real_ return value of your function.

Another approach is the cancelation token approach. We will probably discuss that separately, and it does have some merits, but from our perspective right now its biggest problem is its affect on API signatures (which is especially bad in a language without compile-time overload resolution and parameter typechecking).

The approach we'd like to explore here is having such APIs return a `Task` instance. `Task` would be a class that derives from `Promise`, and represents both an async operation and the ability to cancel that operation.

(Note: `Task` is sometimes known as `CancelablePromise`, but the latter name causes people to go into inexplicable conniptions, whereas the former draws adulation.)

We explore the semantics in more depth in what follows, but the main important feature is that tasks have an additional method, `Task.prototype.cancel(reason)`, which cancels the task.

## Canceling a task

Now let's discuss what exactly canceling the task means. At the very least, we know it puts the task in the canceled state. But how do we get it to stop our HTTP requests?

The answer is that every task (_not_ every promise) has associated with it a **cancel action**. So for our fetch task, this is aborting the HTTP request. For our setTimeout task, it is clearing the timeout.

Here is an example of how this would work in practice, illustrating how creating a new task lets you supply its cancel action:

```js
function delay(ms) {
  return new Task(resolve => {
    const id = setTimeout(resolve);

    return () => clearTimeout(id);
  });
}

const timer = delay(100);

timer.cancel();
```

### Alternative formulation

As an aside, it seems like the following would be fairly close to the above in behavior:

```js
function delay(ms) {
  let id;

  const task = new Task(resolve => id = setTimeout(resolve));
  task.catchCancel(() => clearTimeout(id));

  return task;
}
```

The difference would only be that the second example would necessarily schedule a microtask to run the `clearTimeout`, whereas the former would run it immediately. This seems significant enough that we'd want the former.

### Cancelation vs. resolution

After a promise has been resolved, calling `.cancel()` would be a no-op. A contrived example of this in action is the following:

```js
const task = new Task(resolve => {
  resolve(new Promise(() => {}));

  return cancelAction;
});
task.cancel();
```

In this example, `cancelAction` will never be called, and the promise will stay pending forever (since it is resolved to a forever-pending promise).

Similarly, after a promise has transitioned to the canceled state, its state cannot change again:

```js
new Task((resolve, reject, cancel) => {
  cancel();
  resolve(); // no-op
  reject(); // no-op
});
```

## Canceling derived tasks

One of the most important ergonomic benefits of tasks is how cancelation signals propagates "up" the chain of derived tasks. That is, given

```js
const task1 = delay(100);
const task2 = task1.then(doA);
const task3 = task2.then(doB);
const task4 = task3.catch(doC);

task4.cancel();
```

Then we should cancel the original timeout, and all tasks (`task1` through `task4`) will be in the canceled state, not just `task4`.

This ability to cancel derived tasks is highly convenient in examples like

```js
const task = fetch("https://example.com/foo.json").then(res => res.json()).then(parseFooJSON);

navigateToNextPage.onclick = () => task.cancel();
```

and is in fact one of the motivating reasons for the `Task` design.

The way this is implemented is that `Task.prototype.then` creates a new `Task` instance whose cancelation action is to call `this.cancel()`.

### Cancelation propagates up "as far as it can"

Let's dissect this last example into lots of different variables for easy reference:

```js
const fetchTask = fetch("https://example.com/foo.json");
const jsonAndFetch = fetchTask.then(res => {
  const jsonTask = res.json();
  return jsonTask;
});
const jsonAndFetchAndParse = jsonAndFetch.then(json => {
  const parseTask = parseFooJSON(json);
  return parseTask;
});

navigateToNextPage.onclick = () => jsonAndFetchAndParse.cancel();
```

Let's say that the user clicks on the `navigateToNextPage` button _after_ the fetch has arrived, in the middle of JSON parsing. At this point the states and fates of the tasks involved are as follows:

- `fetchTask` is fulfilled.
- `jsonAndFetch` is pending and resolved to `jsonTask`, which is pending but unresolved.
- `jsonAndFetchAndParse` is pending and unresolved, since `jsonAndFetch` is still pending.
- `parseTask` does not exist.

The result are then that:

- `jsonAndFetchAndParse.cancel()` calls `jsonAndFetch.cancel()` as its cancelation action, since `jsonAndFetchAndParse` unresolved and is derived from `jsonAndFetch`.
- `jsonAndFetch.cancel()` does not cancel `jsonAndFetch`, since `jsonAndFetch` is already resolved. However, it does call `jsonTask.cancel()`, since it is resolved to `jsonTask`.
- `jsonTask` becomes canceled upon the call to `jsonTask.cancel()`, and its cancelation action is triggered (i.e. the one in the spec for `Request.prototype.json()`).
  - This causes `jsonAndFetch` and `jsonAndFetchAndParse` to become canceled through normal state propagation. (However, their `.cancel()` methods are not called again.)

Relevant algorithms:

#### Cancelation action for `.then`-created `Task`s

- If I am unresolved, call parent's `.cancel(r)`
  - Problem: "resolved" is stored very indirectly in the current spec.
- If I am resolved to a promise, call that promise's `.cancel()`.

#### `Task.prototype.cancel`

- Put myself in the canceled state (do not rely on the cancelation action to do this for me)
- Call my own cancelation action

## Async function integration

One of the biggest disadvantages of this approach is that it does not easily integrate with async functions. If we modified the base class... TODO
