import { useState } from "react";
import { Copy, Check, Search, FileCode, Folder, Smartphone, Cpu, Settings, BookOpen } from "lucide-react";
import { androidFiles } from "../data/androidFiles";

export default function AndroidCodeExplorer() {
  const [selectedFileIndex, setSelectedFileIndex] = useState(2); // Start with MainActivity
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedFile = androidFiles[selectedFileIndex];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedFile.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Could not copy:", err);
    }
  };

  // Light-weight custom high-performance syntax colorizer to avoid heavy node packages
  const colorizeCode = (code: string, language: string) => {
    const lines = code.split("\n");
    return lines.map((line, idx) => {
      // Basic escaping of XML/HTML brackets
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      if (language === "kotlin" || language === "javascript" || language === "html") {
        // Comments
        if (escaped.trim().startsWith("//") || escaped.trim().startsWith("/*") || escaped.trim().startsWith("*")) {
          return `<span class="syntax-comment">${escaped}</span>`;
        }

        // Apply formatting rules
        let processed = escaped;

        // Keywords
        const keywords = [
          "package", "import", "class", "fun", "val", "var", "private", "override", 
          "companion", "object", "return", "const", "new", "function", "let", "const", 
          "null", "true", "false", "throw", "try", "catch", "if", "else", "while", "for", 
          "as", "this", "implement", "dependencies", "buildTypes", "compileOptions", "kotlinOptions", "buildFeatures"
        ];
        
        keywords.forEach(kw => {
          const regex = new RegExp(`\\b(${kw})\\b`, 'g');
          processed = processed.replace(regex, `<span class="syntax-keyword">$1</span>`);
        });

        // Annotations
        processed = processed.replace(/(@\w+)/g, `<span class="syntax-annotation">$1</span>`);

        // String literals
        processed = processed.replace(/(&quot;[^&]*&quot;)/g, `<span class="syntax-string">$1</span>`);
        processed = processed.replace(/('[^']*')/g, `<span class="syntax-string">$1</span>`);

        // Selected Types & Classes
        const types = [
          "MainActivity", "ScreenStreamingService", "WebSocketsStreamingServer", "CastCoreAccessibilityService", "String", "Int", "Boolean", 
          "Byte", "Double", "Long", "MediaCodec", "AudioRecord", "MediaFormat", "MediaProjection", 
          "ServerSocket", "Socket", "InputStream", "OutputStream", "ByteBuffer", "Intent", "Bundle", 
          "Toast", "WifiManager", "Context", "VideoDecoder", "EncodedVideoChunk", "AudioContext", "Canvas"
        ];
        types.forEach(ty => {
          const regex = new RegExp(`\\b(${ty})\\b`, 'g');
          processed = processed.replace(regex, `<span class="syntax-type">$1</span>`);
        });

        // Numbers
        processed = processed.replace(/\b(\d+)\b/g, `<span class="syntax-number">$1</span>`);

        return processed;
      } else if (language === "xml") {
        // Comments
        if (escaped.trim().startsWith("&lt;!--")) {
          return `<span class="syntax-comment">${escaped}</span>`;
        }

        // Format tags & attributes
        let processed = escaped;
        // Tags
        processed = processed.replace(/(&lt;\/?[a-zA-Z0-9_\-:]+)/g, `<span class="syntax-keyword">$1</span>`);
        processed = processed.replace(/(\/?&gt;)/g, `<span class="syntax-keyword">$1</span>`);
        // Attributes
        processed = processed.replace(/(\s[a-zA-Z0-9_\-:]+=)/g, `<span class="syntax-type">$1</span>`);
        // Strings
        processed = processed.replace(/(&quot;[^&]*&quot;)/g, `<span class="syntax-string">$1</span>`);

        return processed;
      }
      return escaped;
    });
  };

  // Filter files based on search
  const filteredFiles = androidFiles.filter(file => {
    const term = searchTerm.toLowerCase();
    return (
      file.filename.toLowerCase().includes(term) ||
      file.description.toLowerCase().includes(term) ||
      file.code.toLowerCase().includes(term)
    );
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6" id="code-explorer-root">
      {/* Sidebar navigation */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <div className="bg-[#0c0f16] border border-white/10 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-slate-200 text-xs tracking-wider uppercase flex items-center gap-2 font-bold">
              <Folder size={15} className="text-emerald-400" /> Workspace Tree
            </h3>
            <span className="text-slate-500 text-[10px] font-mono">{androidFiles.length} files</span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search source... "
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#050608] border border-white/10 rounded-lg text-xs py-2 pl-8 pr-3 text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 font-mono"
              id="search-input"
            />
            <Search className="absolute left-2.5 top-2.5 text-slate-600" size={13} />
          </div>

          <div className="flex flex-col gap-1 max-h-[350px] overflow-y-auto pr-1">
            {filteredFiles.map((file) => {
              const originalIndex = androidFiles.findIndex(f => f.path === file.path);
              const isActive = originalIndex === selectedFileIndex;
              
              let fileIconColor = "text-amber-500";
              if (file.filename.endsWith(".kts")) fileIconColor = "text-purple-400";
              if (file.filename.endsWith(".xml")) fileIconColor = "text-orange-400";
              if (file.filename.endsWith(".html")) fileIconColor = "text-sky-400";

              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFileIndex(originalIndex)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs font-mono transition-all flex items-start gap-2.5 ${
                    isActive
                      ? "bg-[#050608] border-l-2 border-emerald-500 text-emerald-400 font-bold"
                      : "text-slate-400 hover:bg-[#050608]/50 hover:text-slate-200"
                  }`}
                  id={`file-btn-${file.filename.replace(/\./g, "-")}`}
                >
                  <FileCode size={15} className={`shrink-0 mt-0.5 ${fileIconColor}`} />
                  <div className="overflow-hidden text-ellipsis">
                    <div className="font-semibold truncate">{file.filename}</div>
                    <div className="text-[10px] text-slate-500 truncate uppercase mt-0.5">{file.path}</div>
                  </div>
                </button>
              );
            })}
            {filteredFiles.length === 0 && (
              <div className="text-center py-6 text-slate-600 text-xs font-mono uppercase">0 MATCHES FOUND</div>
            )}
          </div>
        </div>

        {/* Structural insights quick card */}
        <div className="bg-[#0c0f16] border border-white/10 rounded-xl p-4 flex flex-col gap-3 text-xs shadow-sm">
          <h4 className="font-mono uppercase text-slate-200 flex items-center gap-1.5 text-xs font-bold">
            <Cpu size={14} className="text-emerald-400" /> Hardware Binding
          </h4>
          <p className="text-slate-400 leading-relaxed font-sans text-[11px]">
            Our codebase implements direct zero-copy pipelines. Instead of drawing bitmaps on the processor, the display pipeline streams directly into the H.264 Encoder's hardware Input Surface.
          </p>
          <div className="border-t border-white/5 pt-2 flex flex-col gap-1 select-none">
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase">
              <span>Bitrate Mode</span>
              <span className="text-emerald-400 font-bold">Constant (CBR)</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase">
              <span>Video Profiling</span>
              <span className="text-emerald-400 font-bold font-mono">AVC High 4.2</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase">
              <span>Latency Config</span>
              <span className="text-emerald-400 font-bold">Zero-Frame (KEY_LATENCY=0)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Code Editor Panel */}
      <div className="lg:col-span-3 flex flex-col">
        {selectedFile ? (
          <div className="bg-[#050608] border border-white/10 rounded-2xl flex flex-col overflow-hidden h-[630px] shadow-lg">
            {/* Toolbar file header */}
            <div className="bg-[#0c0f16]/90 py-3 px-5 border-b border-white/10 flex justify-between items-center select-none">
              <div className="flex items-center gap-2.5">
                <FileCode size={16} className="text-emerald-400" />
                <div>
                  <h3 className="font-mono text-slate-200 text-xs font-semibold">{selectedFile.filename}</h3>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{selectedFile.path}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] bg-black text-slate-400 font-mono px-2 py-1 rounded border border-white/5 uppercase">
                  {selectedFile.language}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-[11px] font-mono uppercase bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg transition-all cursor-pointer font-bold"
                  id="copy-code-btn"
                >
                  {copied ? (
                    <>
                      <Check size={13} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Description notice bar */}
            <div className="bg-black/40 px-5 py-2.5 border-b border-white/5 leading-relaxed text-[11px] text-slate-400 font-sans flex items-start gap-2 select-none">
              <BookOpen size={13} className="text-emerald-500/80 shrink-0 mt-0.5" />
              <span>{selectedFile.description}</span>
            </div>

            {/* Source body editor panel */}
            <div className="flex-1 overflow-auto p-4 md:p-6 font-mono text-xs leading-6 selection:bg-emerald-500/30">
              <pre className="text-slate-300">
                <code className="block select-text">
                  {colorizeCode(selectedFile.code, selectedFile.language).map((coloredLine, index) => (
                    <div key={index} className="flex hover:bg-white/5 rounded px-1 group">
                      <span className="w-8 shrink-0 text-right opacity-30 group-hover:opacity-60 pr-4 select-none border-r border-white/5 mr-4 text-[10px]">
                        {index + 1}
                      </span>
                      <span 
                        className="syntax-plain whitespace-pre" 
                        dangerouslySetInnerHTML={{ __html: coloredLine || "&nbsp;" }} 
                      />
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        ) : (
          <div className="bg-[#050608] border border-white/10 rounded-2xl p-12 text-center text-slate-500 h-[630px] flex flex-col justify-center items-center">
            <Smartphone size={32} className="text-slate-700 mb-2 animate-pulse" />
            <p className="text-sm font-mono uppercase mb-1">No file loaded</p>
            <p className="text-xs text-slate-600 font-mono">Select an Android source file from the sidebar project tree to explore its structures.</p>
          </div>
        )}
      </div>
    </div>
  );
}
