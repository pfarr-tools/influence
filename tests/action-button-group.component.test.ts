// @vitest-environment jsdom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import ActionButtonGroup from "../src/services/review/frontend/src/components/ActionButtonGroup.vue"

describe("ActionButtonGroup", () => {
  it("emits a normal trigger for incomplete actions", async () => {
    const wrapper = mount(ActionButtonGroup, {
      props: {
        actions: [
          {
            action: "images",
            completed: false,
            disabled: false,
            label: "Bilder erzeugen",
            primary: true,
            supportsForce: true
          }
        ]
      }
    })

    await wrapper.get("button").trigger("click")

    expect(wrapper.emitted("trigger")).toEqual([[{ action: "images", force: false }]])
  })

  it("opens a force confirmation for completed force-capable actions", async () => {
    const wrapper = mount(ActionButtonGroup, {
      attachTo: document.body,
      props: {
        actions: [
          {
            action: "render",
            completed: true,
            disabled: false,
            label: "Vorschauen rendern",
            primary: false,
            supportsForce: true
          }
        ]
      }
    })

    await wrapper.get("button").trigger("click")

    expect(document.body.textContent).toContain("bereits ausgeführt")
    expect(wrapper.emitted("trigger")).toBeUndefined()

    const footerButtons = document.body.querySelectorAll<HTMLButtonElement>(".modal-footer button")
    footerButtons[1]?.click()

    expect(wrapper.emitted("trigger")).toEqual([[{ action: "render", force: true }]])

    wrapper.unmount()
  })
})
