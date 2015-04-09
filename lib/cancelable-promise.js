const { get_slot } = require("especially/meta");
import Promise from "./promise.js";

export default class CancelablePromise extends Promise {
  constructor(executor, onCanceled) {
    super(executor);

    this._onCanceled = onCanceled;
  }

  cancel() {
    if (get_slot(this, "[[PromiseState]]") !== "pending") {
      return;
    }

    this._onCanceled();
  }
}
