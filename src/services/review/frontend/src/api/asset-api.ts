export async function uploadAsset(postId: string, formData: FormData) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/assets`, {
    body: formData,
    method: "POST"
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Upload fehlgeschlagen." }))
    throw new Error(errorBody.error ?? "Upload fehlgeschlagen.")
  }

  return response.json() as Promise<{ notice: string; storedPath: string }>
}

export async function uploadVoiceover(postId: string, formData: FormData) {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/reel-audio`, {
    body: formData,
    method: "POST"
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Upload fehlgeschlagen." }))
    throw new Error(errorBody.error ?? "Upload fehlgeschlagen.")
  }

  return response.json() as Promise<{ notice: string; storedPath: string }>
}
