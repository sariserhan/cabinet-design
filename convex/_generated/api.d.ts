/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as aiReview from "../aiReview.js";
import type * as auth from "../auth.js";
import type * as bulkReview from "../bulkReview.js";
import type * as catalogReadiness from "../catalogReadiness.js";
import type * as designBlob from "../designBlob.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as projects from "../projects.js";
import type * as recordHelpers from "../recordHelpers.js";
import type * as review from "../review.js";
import type * as sharedProjects from "../sharedProjects.js";
import type * as supplierPricing from "../supplierPricing.js";
import type * as testing from "../testing.js";
import type * as versions from "../versions.js";
import type * as worker from "../worker.js";
import type * as workingCatalog from "../workingCatalog.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  aiReview: typeof aiReview;
  auth: typeof auth;
  bulkReview: typeof bulkReview;
  catalogReadiness: typeof catalogReadiness;
  designBlob: typeof designBlob;
  documents: typeof documents;
  http: typeof http;
  projects: typeof projects;
  recordHelpers: typeof recordHelpers;
  review: typeof review;
  sharedProjects: typeof sharedProjects;
  supplierPricing: typeof supplierPricing;
  testing: typeof testing;
  versions: typeof versions;
  worker: typeof worker;
  workingCatalog: typeof workingCatalog;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
