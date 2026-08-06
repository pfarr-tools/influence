// @vitest-environment jsdom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import WorkflowStepper from "../src/services/review/frontend/src/components/WorkflowStepper.vue"

describe("WorkflowStepper", () => {
  it("renders German step labels and completion states", () => {
    const wrapper = mount(WorkflowStepper, {
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
    expect(wrapper.text()).toContain("Freigabereif")
    expect(wrapper.text()).toContain("erledigt")
    expect(wrapper.text()).toContain("offen")
  })
})
