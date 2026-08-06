import { ref } from "vue"
import { uploadAsset, uploadVoiceover } from "../api/asset-api.js"

export function useAssetUpload(postId: string, onDone: () => Promise<void>) {
  const busy = ref(false)
  const error = ref("")

  async function submitAsset(formData: FormData) {
    busy.value = true
    error.value = ""

    try {
      await uploadAsset(postId, formData)
      await onDone()
    } catch (uploadError) {
      error.value =
        uploadError instanceof Error ? uploadError.message : "Asset konnte nicht gespeichert werden."
    } finally {
      busy.value = false
    }
  }

  async function submitVoiceover(formData: FormData) {
    busy.value = true
    error.value = ""

    try {
      await uploadVoiceover(postId, formData)
      await onDone()
    } catch (uploadError) {
      error.value =
        uploadError instanceof Error ? uploadError.message : "Voiceover konnte nicht gespeichert werden."
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    error,
    submitAsset,
    submitVoiceover
  }
}
