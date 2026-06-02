type DropZoneProps = {
  onFilesSelected: (files: FileList) => void
}

export function DropZone({ onFilesSelected }: DropZoneProps) {
  return (
    <label
      className="drop-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onFilesSelected(event.dataTransfer.files)
      }}
    >
      <input
        multiple
        type="file"
        onChange={(event) => {
          if (event.target.files) {
            onFilesSelected(event.target.files)
            event.target.value = ''
          }
        }}
      />
      <span>Drop files here or choose files</span>
    </label>
  )
}
