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
})
