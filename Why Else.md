# Why `else`?

As explained in ["Not an Error"](Not an Error.md), it is a primary goal of this proposal to make it easy to treat cancelations as non-errors. One path for doing so is to have `catch` not catch cancelations, but this is unable to achieve committee consensus, so the solution presented in this repository is to introduce a new syntactic form, `try { ... } else (e) { ... }`, which ignores cancelations.

There has been some discussion on the exact keyword or syntactic form used for this purpose. This document aims to outline why `else` ends up being the best choice, although at first glance that might be surprising. It summarizes discussions from [#31](https://github.com/tc39/proposal-cancelable-promises/issues/31) and [#35](https://github.com/tc39/proposal-cancelable-promises/issues/35).

## It must be short and conceptually standalone

The concerns about adapting `catch` to ignore cancelations were based on worries about old `catch`-using code not being able to deal with abrupt completions that are not caught by it, if they are introduced into an environment that mixes new code and old code without proper adapter layers. So one of the goals of this proposal is to provide a clean story, where whatever form is chosen can be used in place of `catch` for all new code, with the understanding that new code is written in a world where cancelations exist and authors understand that they should not be caught. In this way, we envision `else` becoming "the new `catch`".

The primary reason we mention this is that using the new syntactic form, whatever it is, must be roughly as easy as using `catch`. This eliminates alternatives like `try { ... } catch error (e) { ... }` or `catch*` or similar, since they are longer and conceptual subsidiaries of `catch`. They are not "the new `catch`", but instead "the special `catch`", which makes them unattractive and thus unfit for our purpose.

## Two paths

This leaves two potential paths we could take:

1. We could use an existing keyword in the language. The possibilities that seem remotely reasonable are `else`, `break`, `protected`, `case`, and (in strict mode) `with`.
2. We could use a non-keyword and make it contextually dependent. This is generally possible since it would be following a `try { ... }` block which gives us the opportunity to reinterpret normal identifiers. Possibilities floated for this alternative include `error`, `except`, `recover`, and `rescue`.

However, it turns out that path 2 has a subtle future-compatibility problem with targeted exception handling

### Targeted exception handling and a contextual keyword

"Targeted exception handling" is a potential future feature, probably blocked on pattern-matching syntax ([strawman](https://gist.github.com/bterlson/da8f02b95b484cd4f8d9)), which allows multiple `catch` clauses for one `try`, choosing the most appropriate one. For example, it could potentially look something like this:

```js
try {
  f();
} catch (e match SyntaxError) {
  a();
} catch (e) {
  b();
}

try {
  g();
} catch (e match EvalError) {
  c();
}
```

In the spirit of being "the new `catch`", whatever we pick needs to be usable with some eventual targeted exception handling as well. For example, let's say we went down path 2, and picked `except`; then the following should be valid and work as you expect (i.e. the same as the above but with the last clause ignoring `Cancel` instances):

```js
try {
  f();
} except (e match SyntaxError) {
  a();
} except (e) { // (*)
  b();
}

try {
  g();
} except (e match EvalError) {
  c();
}
```

However, we have a problem. The line marked `(*)` is ambiguous: is it a fallback `except` clause, or is it a function call followed by a block? Writing it with different whitespace and semicolons, it is

```js
try {
  f();
} except (e match SyntaxError) {
  b();
}

except(e);

{
  c();
}
```

The only fix for this (that we've seen so far) is to disallow semicolon insertion after `except (...)` clauses. But this is fairly distasteful; it would disallow "Allman style"

```js
try
{
  f();
}
except (e match SyntaxError)
{
  b();
}
except (e)
{
  c();
}
```

which is popular with at least some programmers. This degree of whitespace sensitivity is not generally desirable in the language.

### A real keyword does not have this problem

In contrast, a real keyword avoids these problems. Using `else` as the example,

```js
try {
  f();
} else (e match SyntaxError) {
  a();
} else (e) {
  b();
}
```

there is no way of interpreting this as a function call followed by a block, since `else(e);` is not a valid function call.

This is what leads us to prefer the first path, of using an existing keyword, over the second path, of using a contextual keyword. Choosing a contextual keyword causes future-compatibility hazards with the highly-desirable feature of targeted exception handling, whereas an existing keyword will not. As for the choice of existing keyword, I simply think `else` is the best of the options.

## An objection to `else`

One committee member raised the objection that `else` is not a good choice when paired with `then`, i.e. that code like

```js
doSomething()
  .then(a)
  .else(b);
```

would be confusing, as it would imply either `a` or `b` happen (whereas, if `doSomething()` fulfills and `a` rejects, both `a` and `b` happen).

Although I vaguely see this possibility of confusion, I argue that it is not a serious worry, as this kind of exclusivity of "else" only applies in an "if" context, whereas we're specifically trying to give `else` a more general "otherwise" meaning that applies beyond just `if` clauses. In other words, there is an implicit `try` around all promise-using code already, which you make explicit by adding a `catch()` (nowadays) or `else()` (in the future); there is no such implicit `if`.

And, of course, this problem becomes even less important as usage of async functions increases, where explicitly using `.then()` and `.else()` is unnecessary and arguably un-idiomatic.

## An ambiguity with `else`

It's also worth noting that there is a slight ambiguity with `else` anyway when dealing with braceless `if` statements:

```js
if (a)
  try { } else (e match SyntaxError) { }
  else (e) { } // belongs to try or belongs to if?
```

However, this parallels the existing ambiguities for braceless `if` statements, and isn't so bad. Just add more braces and the issue disappears. I feel much more comfortable disallowing this kind of confusing code than I do disallowing Allman-style brace placement.
