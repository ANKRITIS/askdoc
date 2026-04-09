'use client'

import { useState } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger,
  DialogTitle,
  DialogHeader,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUploadThing } from '@/lib/uploadthing'
import { Upload, Loader2, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

export default function UploadButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const router = useRouter()

  const { startUpload, isUploading } = useUploadThing("freePlanUploader", {
    onClientUploadComplete: (res) => {
      console.log("✅ Upload complete!", res);
      toast.success('PDF uploaded successfully!')
      setIsOpen(false)
      setFile(null)
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    },
    onUploadError: (error: Error) => {
      console.error("❌ Upload error:", error);
      toast.error(`Upload failed: ${error.message}`)
    },
    onUploadProgress: (p) => {
      console.log("📊 Upload progress:", p, "%");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    console.log("📄 File selected:", selectedFile);
    
    if (selectedFile) {
      // Validate file type
      if (selectedFile.type !== 'application/pdf') {
        toast.error('Please select a PDF file');
        return;
      }
      
      // Validate file size (4MB = 4 * 1024 * 1024 bytes)
      if (selectedFile.size > 4 * 1024 * 1024) {
        toast.error('File size must be less than 4MB');
        return;
      }
      
      setFile(selectedFile);
      toast.success(`Selected: ${selectedFile.name}`);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }
    
    console.log("🚀 Starting upload for:", file.name);
    
    try {
      await startUpload([file]);
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error('Upload failed. Please try again.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      // Reset file when dialog closes
      if (!open) {
        setFile(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload PDF
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload PDF Document</DialogTitle>
          <DialogDescription>
            Select a PDF file (max 4MB) to upload and chat with
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Input Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label 
              htmlFor="file-upload" 
              className="cursor-pointer block"
            >
              {file ? (
                <div className="space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-blue-500" />
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="text-xs text-blue-600">Click to change file</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="text-gray-600 font-medium">
                    Click to select a PDF file
                  </p>
                  <p className="text-sm text-gray-500">or drag and drop</p>
                  <p className="text-xs text-gray-400 mt-2">PDF up to 4MB</p>
                </div>
              )}
            </label>
          </div>

          {/* Upload Button */}
          <Button 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            className="w-full"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}