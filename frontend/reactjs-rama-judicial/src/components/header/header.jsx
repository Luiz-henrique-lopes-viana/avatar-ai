import { useRef, useState } from "react";
import { appFetch } from "../../api/_";
import { Modal } from "../Modal/modal";

export const Header = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const uploadButtonRef = useRef(null);

  const toggleModal = () => {
    setIsModalOpen((prev) => !prev);
    setUploadStatus(null);
    setSelectedFile(null); 
  };

  const handleFileChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setUploadStatus(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setUploadStatus(null);

    try {
      const base64String = await readFileAsBase64(selectedFile);

      const response = await appFetch("/api/doc-upload", {
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: selectedFile.name,
            file_base64: base64String,
          }),
        },
      });

      if (response.error) {
        throw new Error(response.error || "Upload failed");
      } else {
        setUploadStatus(`Success! ${response.message}`);
        setSelectedFile(null);
      }
    } catch (error) {
      setUploadStatus(`Upload failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFile = () => {
    setSelectedFile(null);
    setUploadStatus(null);
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result?.toString().split(",")[1] || "";
        resolve(result);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <header className="bg-black/80 text-white p-4 flex items-center justify-between shadow-md fixed top-0 left-0 w-full z-50">
      <h1
        className="text-lg font-bold"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        Chat Bot - Avatar Luiza AI
      </h1>
      <nav className="flex gap-4">
        <button
          ref={uploadButtonRef}
          className="bg-[#248a52] hover:bg-[#1d7745] text-white px-3 py-2 rounded-lg transition-colors"
          onClick={toggleModal}
        >
          Upload
        </button>
        <a
          href="https://lookerstudio.google.com/embed/reporting/af2deeb8-e7b7-4acd-bba5-d501b4071cb6/page/eHkFF"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors text-center"
        >
          Informe
        </a>
      </nav>

      <Modal isOpen={isModalOpen} onClose={toggleModal}>
        <h2 className="text-lg font-bold mb-4">Subir archivo</h2>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <span>Elegir un archivo PDF:</span>
              {!selectedFile && (
                <img
                  src="/assets/import.png"
                  alt="Import Icon"
                  className="w-6 h-6"
                />
              )}
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf"
                disabled={isLoading}
              />
            </label>
          </div>

          {selectedFile && (
            <div className="mb-2">
              <p>
                Archivo seleccionado:{" "}
                <span className="font-bold">{selectedFile.name}</span>
                <span className="block text-sm text-gray-500">
                  ({Math.round(selectedFile.size / 1024)} KB)
                </span>
              </p>
              <button
                className="mt-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
                onClick={handleDeleteFile}
                disabled={isLoading}
              >
                Borrar archivo
              </button>
            </div>
          )}

          {uploadStatus && (
            <div
              className={`p-3 rounded-lg ${
                uploadStatus.includes("Success")
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {uploadStatus}
            </div>
          )}

          <div className="flex justify-end gap-2 flex-wrap">
            <button
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              onClick={toggleModal}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              className="bg-[#248a52] hover:bg-[#1d7745] text-white px-4 py-2 rounded-lg disabled:opacity-50"
              onClick={handleUpload}
              disabled={!selectedFile || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Enviando...
                </span>
              ) : (
                "Importar"
              )}
            </button>
          </div>
        </div>
      </Modal>
    </header>
  );
};