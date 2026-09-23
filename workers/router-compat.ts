/**
 * find-my-way 9.9.0 normally compiles four optimizations with new Function.
 * Workers prohibits request-time code generation. These equivalent closures
 * preserve the router's matching/constraint algorithms without relaxing CSP.
 * Private dependency hooks are version-guarded and exercised by compatibility tests.
 */
import HandlerStorage from "find-my-way/lib/handler-storage.js";
import { StaticNode } from "find-my-way/lib/node.js";
import Constrainer from "find-my-way/lib/constrainer.js";
import routerPackage from "find-my-way/package.json";
import { z } from "zod";

if (routerPackage.version !== "9.9.0")
  throw new Error(
    "Review Worker router compatibility before upgrading find-my-way.",
  );
z.config({ jitless: true });

HandlerStorage.prototype._compileCreateParamsObject = function (
  params: string[],
) {
  return (values: unknown[]) => {
    const result = Object.create(null);
    for (let i = 0; i < params.length; i++) result[params[i]] = values[i];
    return result;
  };
};
HandlerStorage.prototype._compileGetHandlerMatchingConstraints = function (
  constrainer: any,
) {
  this.constrainedHandlerStores = {};
  const checks = this.constraints.map((name: string) => {
    const store = constrainer.newStoreForConstraint(name);
    this.constrainedHandlerStores[name] = store;
    this._buildConstraintStore(store, name);
    return {
      name,
      store,
      mask: this._constrainedIndexBitmask(name),
      mustMatch: constrainer.strategies[name].mustMatchWhenDerived,
    };
  });
  const excluded = Object.keys(constrainer.strategies).filter(
    (name) =>
      constrainer.strategies[name].mustMatchWhenDerived &&
      !this.constraints.includes(name),
  );
  const initial = (1 << this.handlers.length) - 1;
  this._getHandlerMatchingConstraints = function (
    derived: Record<string, unknown>,
  ) {
    let candidates = initial;
    for (const check of checks) {
      const value = derived[check.name];
      if (value === undefined) candidates &= check.mask;
      else {
        const matches = check.store.get(value) || 0;
        candidates &= check.mustMatch ? matches : matches | check.mask;
      }
      if (candidates === 0) return null;
    }
    for (const name of excluded) if (derived[name] !== undefined) return null;
    return this.handlers[31 - Math.clz32(candidates)];
  };
};
StaticNode.prototype._compilePrefixMatch = function () {
  const prefix = this.prefix;
  this.matchPrefix =
    prefix.length === 1
      ? () => true
      : (path: string, index: number) =>
          path.startsWith(prefix.slice(1), index + 1);
};
Constrainer.prototype._buildDeriveConstraints = function () {
  if (this.strategiesInUse.size === 0) return;
  const names = [...this.strategiesInUse];
  this.deriveSyncConstraints = function (req: any, ctx: any) {
    const result: Record<string, unknown> = {};
    for (const name of names) {
      const strategy = this.strategies[name];
      result[name] = strategy.isCustom
        ? strategy.deriveConstraint(req, ctx)
        : name === "version"
          ? req.headers["accept-version"]
          : req.headers.host || req.headers[":authority"];
    }
    return result;
  };
};
