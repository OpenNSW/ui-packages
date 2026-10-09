import { withJsonFormsControlProps } from '@jsonforms/react'
import type { ControlElement, JsonSchema } from '@jsonforms/core'
import { Card, Flex, Text, Box, IconButton, Button, Tooltip } from '@radix-ui/themes'
import {
  UploadIcon,
  FileTextIcon,
  Cross2Icon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  DownloadIcon,
} from '@radix-ui/react-icons'
import { useState, useRef, useEffect, useCallback, type ChangeEvent, type DragEvent } from 'react'
import { useUpload } from '../contexts/UploadContext'
import { getErrorMessage } from '../utils/error'
import { formatBytes, formatAccept } from '../utils/format'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { downloadFromUrl, downloadName } from '../utils/download'
import { isBrowserViewable, matchesAccept } from '../utils/file'
import * as React from 'react'

interface FileEntry {
  key: string
  name: string
  type?: string
  blobUrl?: string
}

interface XFileOptions {
  maxFiles?: number
  maxSize?: number
  accept?: string
  /**
   * Base name for the row label and Download. `{index}` is the file's 1-based
   * position (removing an earlier file renumbers later ones). The file's real
   * extension is appended. e.g. `Attachment_{index}`. Download fetches the
   * signed storage URL in the browser, so the bucket must allow CORS GET from
   * the app origin.
   */
  fileName?: string
}

interface FileControlProps {
  data: string | string[] | null
  handleChange(path: string, value: string | string[] | undefined): void
  path: string
  label: string
  required?: boolean
  uischema?: ControlElement
  schema?: JsonSchema & { 'x-file'?: XFileOptions }
  enabled?: boolean
  errors: string
  visible?: boolean
}

function normalizeData(data: string | string[] | null): string[] {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

const FileControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  uischema,
  schema,
  enabled,
  errors,
  visible = true,
}: FileControlProps) => {
  const uploadContext = useUpload()

  // `undefined`, not `null` — this control's schema is `type: 'string'`, which
  // `null` does not satisfy, so clearing with null would leave a hidden-then-
  // shown field stuck on "must be string". undefined restores the pristine
  // "nothing selected" state instead.
  useClearWhenHidden(visible, path, handleChange)

  const isValid = !errors || errors.length === 0

  // Read x-file constraints from schema
  const xFile: XFileOptions = schema?.['x-file'] ?? {}
  const uiOptions = uischema?.options ?? {}

  const maxFiles = xFile.maxFiles ?? (uiOptions.maxFiles as number) ?? 1
  const maxSize = xFile.maxSize ?? (uiOptions.maxSize as number) ?? 5 * 1024 * 1024
  const accept = xFile.accept ?? (uiOptions.accept as string) ?? 'image/*,application/pdf'
  const fileNameTemplate = typeof xFile.fileName === 'string' ? xFile.fileName : undefined

  const isMulti = maxFiles > 1
  const isEnabled = enabled !== false

  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [fileEntries, setFileEntries] = useState<Record<string, FileEntry>>({})
  const activeBlobs = useRef<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const currentKeys = normalizeData(data)
  const atLimit = currentKeys.length >= maxFiles

  const rowLabel = (key: string, index: number): string => {
    const entry = fileEntries[key]
    if (fileNameTemplate) {
      return downloadName(fileNameTemplate, { index }, { name: entry?.name, key })
    }
    return entry?.name ?? 'Uploaded File'
  }

  const fileForViewability = (key: string) => {
    const entry = fileEntries[key]
    return { name: entry?.name ?? key, type: entry?.type }
  }

  const resolveFileUrl = async (key: string): Promise<string | undefined> => {
    const blobUrl = fileEntries[key]?.blobUrl
    if (blobUrl) return blobUrl
    const result = await uploadContext?.getDownloadUrl?.(key)
    return result?.url
  }

  useEffect(() => {
    return () => {
      activeBlobs.current.forEach((url) => URL.revokeObjectURL(url))
      activeBlobs.current.clear()
    }
  }, [])

  const processFile = useCallback(
    async (file: File) => {
      setError(null)

      if (currentKeys.length >= maxFiles) {
        setError(`Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed.`)
        return
      }
      if (file.size > maxSize) {
        setError(`File exceeds the ${formatBytes(maxSize)} limit.`)
        return
      }

      if (!matchesAccept(file, accept)) {
        setError(`Invalid type. Accepted: ${formatAccept(accept)}`)
        return
      }

      if (!uploadContext?.onUpload) {
        setError('Upload service not configured.')
        return
      }

      try {
        const result = await uploadContext.onUpload(file)
        const blobUrl = URL.createObjectURL(file)
        activeBlobs.current.add(blobUrl)
        const entry: FileEntry = {
          key: result.key,
          name: result.name ?? file.name,
          type: file.type || undefined,
          blobUrl,
        }

        setFileEntries((prev) => ({ ...prev, [result.key]: entry }))

        const newKeys = [...currentKeys, result.key]
        handleChange(path, isMulti ? newKeys : newKeys[0])
      } catch {
        setError('Upload failed. Please try again.')
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [currentKeys, maxFiles, maxSize, accept, uploadContext, path, handleChange, isMulti],
  )

  if (visible === false) {
    return null
  }

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isEnabled || atLimit) return
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (!isEnabled || atLimit) return
    if (e.dataTransfer.files?.[0]) void processFile(e.dataTransfer.files[0])
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      void processFile(e.target.files[0])
      e.target.value = ''
    }
  }

  const handleRemove = (key: string) => {
    if (!isEnabled) return
    setFileEntries((prev) => {
      const next = { ...prev }
      const blobUrl = next[key]?.blobUrl
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        activeBlobs.current.delete(blobUrl)
      }
      delete next[key]
      return next
    })
    setRowErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    const newKeys = currentKeys.filter((k) => k !== key)
    // `undefined`, not `null` — same reason as the clear-when-hidden call
    // above: `null` doesn't satisfy this field's `type: 'string'` schema, so
    // removing the last file would leave it failing validation. `newKeys[0]`
    // is already `undefined` once the array is empty, so the scalar branch
    // needs no fallback at all.
    handleChange(path, isMulti ? (newKeys.length > 0 ? newKeys : undefined) : newKeys[0])
  }

  const clearRowError = (key: string) => {
    setRowErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const onView = async (e: React.MouseEvent<HTMLButtonElement>, key: string) => {
    e.preventDefault()
    clearRowError(key)

    const blobUrl = fileEntries[key]?.blobUrl
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer')?.focus()
      return
    }
    // Open synchronously so the popup blocker does not block the tab.
    const newWindow = window.open('', '_blank')
    if (!newWindow) return
    try {
      const url = await resolveFileUrl(key)
      if (url) newWindow.location.href = url
      else {
        newWindow.close()
        setRowErrors((prev) => ({ ...prev, [key]: 'Unable to open file.' }))
      }
    } catch {
      newWindow.close()
      setRowErrors((prev) => ({ ...prev, [key]: 'Unable to open file.' }))
    }
  }

  const onDownload = async (key: string, index: number) => {
    clearRowError(key)
    const name = downloadName(fileNameTemplate, { index }, { name: fileEntries[key]?.name, key })
    try {
      const url = await resolveFileUrl(key)
      if (!url) {
        setRowErrors((prev) => ({ ...prev, [key]: 'Unable to download file.' }))
        return
      }
      await downloadFromUrl(url, name)
    } catch {
      setRowErrors((prev) => ({ ...prev, [key]: 'Unable to download file.' }))
    }
  }

  if (!isEnabled && currentKeys.length === 0) return null

  const remaining = maxFiles - currentKeys.length
  const showDropZone = isEnabled && !atLimit

  return (
    <Box mb="4">
      {/* ── Header row ── */}
      <Flex align="center" justify="between" mb="2">
        <Text as="label" size="2" weight="bold">
          {label}
          {required && <Text color="red"> *</Text>}
        </Text>
        <Text size="1" color="gray">
          {isMulti
            ? `Up to ${maxFiles} files · ${formatBytes(maxSize)} each · ${formatAccept(accept)}`
            : `${formatBytes(maxSize)} · ${formatAccept(accept)}`}
        </Text>
      </Flex>

      {/* ── Uploaded file rows ── */}
      {currentKeys.map((key, position) => {
        const index = position + 1
        const originalName = fileEntries[key]?.name
        const showSecondary = Boolean(fileNameTemplate && originalName)
        const rowError = rowErrors[key]
        const canView = isBrowserViewable(fileForViewability(key))

        return (
          <Card key={key} size="2" variant="surface" mb="2">
            <Flex align="center" gap="3">
              <Box
                style={{
                  background: 'var(--blue-3)',
                  padding: 8,
                  borderRadius: 6,
                  color: 'var(--blue-9)',
                  flexShrink: 0,
                }}
              >
                <FileTextIcon width="20" height="20" />
              </Box>
              <Box style={{ flex: 1, overflow: 'hidden' }}>
                <Text
                  size="2"
                  weight="bold"
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rowLabel(key, index)}
                </Text>
                {showSecondary && (
                  <Text
                    size="1"
                    color="gray"
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {originalName}
                  </Text>
                )}
              </Box>
              <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
                {canView && (
                  <Button variant="soft" color="blue" size="1" onClick={(e) => void onView(e, key)}>
                    View
                  </Button>
                )}
                <Tooltip content="Download">
                  <IconButton
                    variant="ghost"
                    color="gray"
                    aria-label="Download"
                    onClick={() => void onDownload(key, index)}
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <CheckCircledIcon style={{ color: 'var(--green-9)', width: 18, height: 18 }} />
                {isEnabled && (
                  <IconButton variant="ghost" color="gray" onClick={() => handleRemove(key)}>
                    <Cross2Icon />
                  </IconButton>
                )}
              </Flex>
            </Flex>
            {rowError && (
              <Text color="red" size="1" mt="2" style={{ display: 'block' }}>
                {rowError}
              </Text>
            )}
          </Card>
        )
      })}

      {/* ── Drop zone — hidden once limit reached ── */}
      {showDropZone && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{ cursor: 'pointer' }}
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center',
            'transition-all duration-200 ease-in-out',
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : error
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
          ].join(' ')}
        >
          <input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />
          <Flex direction="column" align="center" gap="2">
            {error ? (
              <>
                <ExclamationTriangleIcon style={{ width: 32, height: 32, color: 'var(--red-9)' }} />
                <Text size="2" color="red" weight="medium">
                  {error}
                </Text>
                <Text size="1" color="gray">
                  Click to try again
                </Text>
              </>
            ) : (
              <>
                <UploadIcon style={{ width: 32, height: 32, color: 'var(--gray-8)' }} />
                <Text size="2" weight="medium">
                  {currentKeys.length > 0
                    ? `Add another file (${remaining} remaining)`
                    : 'Click to upload or drag and drop'}
                </Text>
                <Text size="1" color="gray">
                  {formatBytes(maxSize)} max · {formatAccept(accept)}
                </Text>
              </>
            )}
          </Flex>
        </div>
      )}

      {/* ── Limit reached nudge ── */}
      {isEnabled && atLimit && isMulti && (
        <Text size="1" color="gray" mt="1" style={{ display: 'block', textAlign: 'center' }}>
          Maximum {maxFiles} files uploaded. Remove one to replace it.
        </Text>
      )}
      {!isValid && (
        <Text color="red" size="1" mt="2" style={{ display: 'block' }}>
          {getErrorMessage(errors, label)}
        </Text>
      )}
    </Box>
  )
}

export default withJsonFormsControlProps(FileControl)
