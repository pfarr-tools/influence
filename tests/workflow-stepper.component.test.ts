// @vitest-environment jsdom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import WorkflowBadges from "../src/services/review/frontend/src/components/WorkflowBadges.vue"

describe("WorkflowBadges", () => {
  it("renders German step labels and completion states", () => {
    const wrapper = mount(WorkflowBadges, {
      props: {
        workflow: {
          contentGenerated: true,
          exportGenerated: false,
          imagesGenerated: true,
          qaReadyForApproval: false,
          qaRun: true,
          reelImagesGenerated: false,
          reelRendered: false,
          rendered: true,
          scaffolded: true
        }
      }
    })

    expect(wrapper.text()).toContain("Gerüst")
    expect(wrapper.text()).toContain("QA bereit")
    expect(wrapper.findAll(".badge").length).toBeGreaterThan(3)
  })

  it("places QA approval before publication approval", async () => {
    const actions = [
      "scaffold",
      "generate",
      "qa",
      "approve",
      "images",
      "images-reel",
      "render",
      "render-reel",
      "approve-publication"
    ].map((action) => ({
      action,
      completed: false,
      disabled: false,
      label: action,
      supportsForce: false
    }))
    const wrapper = mount(WorkflowBadges, {
      props: {
        actions,
        workflow: {
          contentGenerated: true,
          exportGenerated: false,
          imagesGenerated: false,
          qaReadyForApproval: true,
          qaRun: true,
          reelImagesGenerated: false,
          reelRendered: false,
          rendered: false,
          scaffolded: true
        }
      }
    })

    await wrapper.findAll("button")[3]?.trigger("click")

    expect(wrapper.emitted("trigger")).toEqual([
      [{ action: "approve", force: false }]
    ])
  })
})
