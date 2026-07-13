/**
 * Step logger + report metadata.
 *
 * `step()` wraps test.step() so every significant action appears in the
 * Playwright HTML report, the trace viewer AND the Allure report (the
 * allure-playwright reporter nests test.step() calls as Allure steps).
 * This makes failures trivially easy to diagnose: you see exactly which
 * step failed and what data it was using.
 *
 *   await Logger.step('Fill RFC field', async () => {
 *     await rfcField.fill(data.rfc);
 *   });
 *
 * The remaining helpers add Allure metadata (labels, tags, attachments) so
 * the report groups and enriches results. They are no-ops in every reporter
 * except Allure, so they are always safe to call. Keep report concerns here —
 * never import `allure-js-commons` into a flow, procedure or spec.
 */

import { test } from '@playwright/test';
import {
  attachment,
  attachmentPath,
  severity as allureSeverity,
  tags as allureTags,
  epic as allureEpic,
  feature as allureFeature,
  story as allureStory,
  label as allureLabel,
  ContentType,
  Severity,
} from 'allure-js-commons';

export class Logger {
  /**
   * Wraps an action in a named Playwright step.
   * The step name appears in the HTML report, trace viewer and Allure report.
   */
  static async step<T>(name: string, action: () => Promise<T>): Promise<T> {
    return test.step(name, action);
  }

  /**
   * Logs a message to the terminal with a consistent prefix.
   * Useful for debugging — visible in CI logs even when the test passes.
   */
  static info(message: string): void {
    console.log(`[VUCEM] ${new Date().toISOString()} — ${message}`);
  }

  /**
   * Logs a warning. Shows up clearly in CI logs.
   */
  static warn(message: string): void {
    console.warn(`[VUCEM WARN] ${new Date().toISOString()} — ${message}`);
  }

  /**
   * Attaches inline content (text/JSON) to the current test in the Allure report.
   * e.g. the captured folio, a request payload, or a computed value.
   */
  static async attach(
    name: string,
    content: string | Buffer,
    contentType: string = ContentType.TEXT
  ): Promise<void> {
    await attachment(name, content, contentType);
  }

  /**
   * Attaches a file on disk to the current test in the Allure report,
   * e.g. a downloaded acuse PDF saved by ArtifactStore.
   */
  static async attachFile(
    name: string,
    filePath: string,
    contentType: string = 'application/pdf'
  ): Promise<void> {
    await attachmentPath(name, filePath, { contentType });
  }

  /** Sets the Allure severity for the current test (blocker→trivial). */
  static async severity(level: Severity): Promise<void> {
    await allureSeverity(level);
  }

  /** Adds one or more Allure tags to the current test (e.g. 'cofepris', 'smoke'). */
  static async tags(...names: string[]): Promise<void> {
    await allureTags(...names);
  }

  /**
   * Groups the test in Allure's Behaviors tree.
   * Convention here: epic = department (COFEPRIS), feature = procedure code,
   * story = scenario/test-case group.
   */
  static async suite(epic: string, feature: string, story?: string): Promise<void> {
    await allureEpic(epic);
    await allureFeature(feature);
    if (story) await allureStory(story);
  }

  /** Generic Allure label escape hatch (owner, layer, custom grouping…). */
  static async label(name: string, value: string): Promise<void> {
    await allureLabel(name, value);
  }
}

// Re-export the Allure enums so callers set severity/content type without a
// direct allure-js-commons import (keeps the "report concerns live in Logger" rule).
export { Severity, ContentType } from 'allure-js-commons';
