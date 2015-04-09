import Promise from "../../lib/promise.js";

export default function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
