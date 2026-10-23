import { createContext, useContext, type ReactNode } from 'react'

/**
 * Contract for upload: applications provide the implementation;
 * the renderer only calls these callbacks
 */
export interface UploadResponse {
  key: string
  name?: string
}

export type UploadHandler = (file: File) => Promise<UploadResponse>
export interface DownloadUrlResult {
  url: string
  expiresAt: number
  /**
   * The file's extension with its dot (`.xlsx`), when known. A saved form's
   * value is an opaque reference, so the control names a saved file's download
   * from this.
   */
  extension?: string
  mimeType?: string
  /**
   * How the server serves the file: `inline` when a browser may open it, and
   * `attachment` when it is only saved. A saved file's View opens it in a tab
   * only for `inline`, and downloads it for `attachment` or when this is absent.
   */
  disposition?: 'inline' | 'attachment'
}

export type GetDownloadUrl = (key: string) => Promise<DownloadUrlResult>

export interface UploadContextValue {
  onUpload?: UploadHandler
  getDownloadUrl?: GetDownloadUrl
}

const UploadContext = createContext<UploadContextValue | null>(null)

export function UploadProvider({
  children,
  onUpload,
  getDownloadUrl,
}: {
  children: ReactNode
  onUpload?: UploadHandler
  getDownloadUrl?: GetDownloadUrl
}) {
  const value: UploadContextValue = { onUpload, getDownloadUrl }
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

export function useUpload(): UploadContextValue | null {
  return useContext(UploadContext)
}
