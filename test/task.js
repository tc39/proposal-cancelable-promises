"use strict";
const assert = require("assert");
const Task = require("../lib/task.js");
const delay = require("./helpers/delay.js");

describe("Task.prototype.cancel basics", () => {
  it("should cause the task to be canceled with the given reason (subscribe before)", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    const t = new Task(() => {});
    t.catchCancel(arg => onCanceledArg = arg);

    t.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "onCanceled should be called with the reason");
    });
  });

  it("should cause the task to be canceled with the given reason (subscribe after)", () => {
    const reason = { some: "reason" };
    let onCanceledArg;

    const t = new Task(() => {});
    t.catchCancel(arg => onCanceledArg = arg);

    t.cancel(reason);

    return delay().then(() => {
      assert.strictEqual(onCanceledArg, reason, "onCanceled should be called with the reason");
    });
  });
});
