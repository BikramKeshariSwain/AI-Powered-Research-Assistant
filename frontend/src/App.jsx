import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

const API_BASE_URL = "http://127.0.0.1:8000";

// ------------------------------------
// Get user ID from JWT
// ------------------------------------
function getUserIdFromToken(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Number(payload.sub);
  } catch (error) {
    console.error("Could not read token:", error);
    return null;
  }
}

// ------------------------------------
// Main App
// ------------------------------------
function App() {
  // ==========================================
  // AUTHENTICATION
  // ==========================================

  const [token, setToken] = useState(
    localStorage.getItem("access_token")
  );

  const [userId, setUserId] = useState(
    getUserIdFromToken(localStorage.getItem("access_token"))
  );

  const [showRegister, setShowRegister] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] =
    useState("");

  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] =
    useState(false);

  // ==========================================
  // DOCUMENT
  // ==========================================

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");

  const [documents, setDocuments] = useState([]);

  const [selectedDocumentId, setSelectedDocumentId] =
    useState(null);

  const [selectedDocumentTitle, setSelectedDocumentTitle] =
    useState("");

  const [summary, setSummary] = useState("");

  // ==========================================
  // CHAT
  // ==========================================

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const [chatHistory, setChatHistory] = useState([]);

  const [selectedChat, setSelectedChat] = useState(null);

  // Conversation ID
  const [conversationId, setConversationId] =
    useState(null);

  // ==========================================
  // LOADING
  // ==========================================

  const [uploadLoading, setUploadLoading] =
    useState(false);

  const [chatLoading, setChatLoading] =
    useState(false);

  const [deleteLoading, setDeleteLoading] =
    useState(null);

  const [pdfLoading, setPdfLoading] =
    useState(false);

  // ==========================================
  // GENERAL
  // ==========================================

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  // ==========================================
  // CREATE GROUPED CONVERSATIONS
  // ==========================================
  //
  // Multiple chat records can belong to the same
  // conversation_id.
  //
  // We group them here so the sidebar shows
  // one conversation instead of every message.
  //
  // Old chat records that have no conversation_id
  // are treated as separate conversations.
  // ==========================================

  const groupedConversations = (() => {
    const groups = {};

    chatHistory.forEach((chat) => {
      const key = chat.conversation_id
        ? chat.conversation_id
        : `legacy-${chat.id}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(chat);
    });

    return Object.entries(groups)
      .map(([conversationKey, chats]) => {
        const sortedChats = [...chats].sort(
          (a, b) => b.id - a.id
        );

        const latestChat = sortedChats[0];

        return {
          conversationKey,
          conversationId:
            latestChat.conversation_id || null,
          chats: sortedChats,
          latestChat,
          documentId: latestChat.document_id,
        };
      })
      .sort(
        (a, b) =>
          b.latestChat.id - a.latestChat.id
      );
  })();

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    localStorage.removeItem("access_token");

    setToken(null);
    setUserId(null);

    setDocuments([]);
    setChatHistory([]);

    setFile(null);
    setTitle("");

    setSelectedDocumentId(null);
    setSelectedDocumentTitle("");

    setSummary("");

    setQuestion("");
    setAnswer("");

    setSelectedChat(null);
    setConversationId(null);

    setEmail("");
    setPassword("");

    setError("");
    setSuccessMessage("");
  };

  // ==========================================
  // LOGIN
  // ==========================================

  const handleLogin = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoginLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Login failed."
        );
      }

      localStorage.setItem(
        "access_token",
        data.access_token
      );

      setToken(data.access_token);

      const currentUserId = getUserIdFromToken(
        data.access_token
      );

      setUserId(currentUserId);

      setPassword("");
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // ==========================================
  // REGISTER
  // ==========================================

  const handleRegister = async (event) => {
    event.preventDefault();

    if (!registerName.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!registerEmail.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (!registerPassword) {
      setError("Please enter a password.");
      return;
    }

    if (registerPassword.length < 8) {
      setError(
        "Password must be at least 8 characters."
      );
      return;
    }

    setRegisterLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: registerName,
            email: registerEmail,
            password: registerPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Registration failed."
        );
      }

      setSuccessMessage(
        "Account created successfully. Please login."
      );

      setShowRegister(false);
      setEmail(registerEmail);

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");

      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setRegisterLoading(false);
    }
  };

  // ==========================================
  // LOAD DOCUMENTS
  // ==========================================

  const loadDocuments = async () => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/documents`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Could not load documents."
        );
      }

      setDocuments(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // ==========================================
  // LOAD CHAT HISTORY
  // ==========================================

  const loadChatHistory = async () => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/chats`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Could not load chat history."
        );
      }

      const sortedChats = [...data].sort(
        (a, b) => b.id - a.id
      );

      setChatHistory(sortedChats);
    } catch (err) {
      setError(err.message);
    }
  };

  // ==========================================
  // LOAD USER DATA
  // ==========================================

  useEffect(() => {
    if (token) {
      loadDocuments();
      loadChatHistory();
    }
  }, [token]);

  // ==========================================
  // SELECT EXISTING CHAT
  // ==========================================

  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);

    setSelectedDocumentId(chat.document_id);

    setConversationId(
      chat.conversation_id || null
    );

    const document = documents.find(
      (doc) => doc.id === chat.document_id
    );

    if (document) {
      setSelectedDocumentTitle(document.title);
    } else {
      setSelectedDocumentTitle("Document");
    }

    setQuestion("");
    setAnswer(chat.assistant_response);

    setError("");
    setSuccessMessage("");

    // Load the summary for this document
    try {
      const response = await fetch(
        `${API_BASE_URL}/summaries`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const summaries = await response.json();

      if (!response.ok) {
        throw new Error(
          summaries.detail ||
            "Could not load summary."
        );
      }

      const documentSummary = summaries.find(
        (item) =>
          item.document_id === chat.document_id
      );

      if (documentSummary) {
        setSummary(documentSummary.summary_text);
      } else {
        setSummary(
          "No saved summary was found for this document."
        );
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // ==========================================
  // NEW CHAT
  // ==========================================

  const handleNewChat = () => {
    setSelectedChat(null);

    setSelectedDocumentId(null);
    setSelectedDocumentTitle("");

    setSummary("");

    setQuestion("");
    setAnswer("");

    setConversationId(null);

    setTitle("");
    setFile(null);

    setError("");
    setSuccessMessage("");
  };

  // ==========================================
  // UPLOAD DOCUMENT
  // ==========================================

  const handleUpload = async () => {
    if (!token) {
      setError("Please login first.");
      return;
    }

    if (!file) {
      setError("Please select a PDF file.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a document title.");
      return;
    }

    setUploadLoading(true);

    setError("");
    setSuccessMessage("");

    setSummary("");
    setAnswer("");

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(
        `${API_BASE_URL}/upload-and-summarize?title=${encodeURIComponent(
          title
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Upload failed."
        );
      }

      setSelectedDocumentId(data.document_id);

      setSelectedDocumentTitle(title);

      setSummary(data.summary);

      // New uploaded document starts
      // a fresh conversation.
      setConversationId(null);
      setSelectedChat(null);

      setTitle("");
      setFile(null);

      await loadDocuments();

      setSuccessMessage(
        "Document uploaded successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadLoading(false);
    }
  };

  // ==========================================
  // ASK AI
  // ==========================================

  const handleAskAI = async () => {
    if (!token || !userId) {
      setError("Please login first.");
      return;
    }

    if (!selectedDocumentId) {
      setError(
        "Please select or upload a document first."
      );
      return;
    }

    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }

    setChatLoading(true);

    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/chats`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            user_id: userId,
            document_id: selectedDocumentId,
            user_message: question,
            conversation_id: conversationId,
          }),
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Chat request failed."
        );
      }

      setAnswer(data.assistant_response);

      // Store conversation ID returned by backend
      setConversationId(
        data.conversation_id
      );

      setSelectedChat(data);

      // Clear input after sending
      setQuestion("");

      await loadChatHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  // ==========================================
  // DELETE ENTIRE CONVERSATION
  // ==========================================

  const handleDeleteConversation = async (
    conversation
  ) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this entire conversation?"
    );

    if (!confirmDelete) {
      return;
    }

    setDeleteLoading(
      conversation.conversationKey
    );
    setError("");

    try {
      // Delete every message belonging to this conversation.
      for (const chat of conversation.chats) {
        const response = await fetch(
          `${API_BASE_URL}/chats/${chat.id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.status === 401) {
          handleLogout();
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail ||
              "Could not delete conversation."
          );
        }
      }

      // Remove all deleted messages from local state
      const deletedIds = new Set(
        conversation.chats.map(
          (chat) => chat.id
        )
      );

      setChatHistory((previousChats) =>
        previousChats.filter(
          (chat) => !deletedIds.has(chat.id)
        )
      );

      // If the deleted conversation is currently
      // selected, clear the main screen.
      if (
        selectedChat &&
        conversation.chats.some(
          (chat) =>
            chat.id === selectedChat.id
        )
      ) {
        setSelectedChat(null);
        setSelectedDocumentId(null);
        setSelectedDocumentTitle("");
        setSummary("");
        setQuestion("");
        setAnswer("");
        setConversationId(null);
      }

      setSuccessMessage(
        "Conversation deleted successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteLoading(null);
    }
  };

  // ==========================================
  // OPEN PDF
  // ==========================================

  const handleOpenPdf = async () => {
    if (!selectedDocumentId) {
      setError("No document selected.");
      return;
    }

    setPdfLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/documents/${selectedDocumentId}/file`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          data.detail ||
            "Could not open PDF."
        );
      }

      const blob = await response.blob();

      const pdfUrl =
        URL.createObjectURL(blob);

      window.open(pdfUrl, "_blank");

      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // ==========================================
  // LOGIN / REGISTER SCREEN
  // ==========================================

  if (!token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f7fb",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            background: "#ffffff",
            padding: "35px",
            borderRadius: "18px",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.08)",
            boxSizing: "border-box",
          }}
        >
          {!showRegister ? (
            <>
              <h1>AI Research Assistant</h1>

              <p>
                Login to research your documents
                with AI.
              </p>

              <form onSubmit={handleLogin}>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "12px",
                    boxSizing: "border-box",
                  }}
                />

                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "15px",
                    boxSizing: "border-box",
                  }}
                />

                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    cursor: "pointer",
                  }}
                >
                  {loginLoading
                    ? "Logging in..."
                    : "Login"}
                </button>
              </form>

              {error && (
                <p>
                  <strong>Error:</strong> {error}
                </p>
              )}

              {successMessage && (
                <p>
                  <strong>
                    {successMessage}
                  </strong>
                </p>
              )}

              <p
                style={{
                  marginTop: "20px",
                }}
              >
                Don't have an account?
              </p>

              <button
                onClick={() => {
                  setShowRegister(true);
                  setError("");
                  setSuccessMessage("");
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  cursor: "pointer",
                }}
              >
                Create Account
              </button>
            </>
          ) : (
            <>
              <h1>Create Account</h1>

              <p>
                Create an account to start
                researching.
              </p>

              <form onSubmit={handleRegister}>
                <input
                  type="text"
                  placeholder="Full name"
                  value={registerName}
                  onChange={(e) =>
                    setRegisterName(
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "12px",
                    boxSizing: "border-box",
                  }}
                />

                <input
                  type="email"
                  placeholder="Email"
                  value={registerEmail}
                  onChange={(e) =>
                    setRegisterEmail(
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "12px",
                    boxSizing: "border-box",
                  }}
                />

                <input
                  type="password"
                  placeholder="Password (minimum 8 characters)"
                  value={registerPassword}
                  onChange={(e) =>
                    setRegisterPassword(
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "15px",
                    boxSizing: "border-box",
                  }}
                />

                <button
                  type="submit"
                  disabled={registerLoading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    cursor: "pointer",
                  }}
                >
                  {registerLoading
                    ? "Creating account..."
                    : "Create Account"}
                </button>
              </form>

              {error && (
                <p>
                  <strong>Error:</strong> {error}
                </p>
              )}

              <p
                style={{
                  marginTop: "20px",
                }}
              >
                Already have an account?
              </p>

              <button
                onClick={() => {
                  setShowRegister(false);
                  setError("");
                  setSuccessMessage("");
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  cursor: "pointer",
                }}
              >
                Back to Login
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // CHATGPT-STYLE DASHBOARD
  // ==========================================

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#f7f7f8",
        color: "#222",
      }}
    >
      {/* ======================================
          LEFT SIDEBAR
      ======================================= */}

      <aside
        style={{
          width: "280px",
          minWidth: "280px",
          background: "#202123",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px",
            fontSize: "20px",
            fontWeight: "bold",
            borderBottom:
              "1px solid rgba(255,255,255,0.08)",
          }}
        >
          AI Research Assistant
        </div>

        {/* New Chat */}
        <div
          style={{
            padding: "15px",
          }}
        >
          <button
            onClick={handleNewChat}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border:
                "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#ffffff",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            ＋ New Chat
          </button>
        </div>

        {/* Recent Chats */}
        <div
          style={{
            padding: "0 15px",
            color: "#9ca3af",
            fontSize: "13px",
            fontWeight: "bold",
          }}
        >
          Recent Chats
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px",
          }}
        >
          {groupedConversations.length === 0 ? (
            <p
              style={{
                color: "#9ca3af",
                padding: "10px",
                fontSize: "14px",
              }}
            >
              No chats yet.
            </p>
          ) : (
            groupedConversations.map(
              (conversation) => {
                const document = documents.find(
                  (doc) =>
                    doc.id ===
                    conversation.documentId
                );

                const isSelected =
                  selectedChat &&
                  conversation.chats.some(
                    (chat) =>
                      chat.id ===
                      selectedChat.id
                  );

                return (
                  <div
                    key={
                      conversation.conversationKey
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "4px",
                    }}
                  >
                    <button
                      onClick={() =>
                        handleSelectChat(
                          conversation.latestChat
                        )
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "10px",
                        borderRadius: "7px",
                        border: "none",
                        background: isSelected
                          ? "#343541"
                          : "transparent",
                        color: "#ffffff",
                        cursor: "pointer",
                        textAlign: "left",
                        overflow: "hidden",
                      }}
                      title={
                        conversation.latestChat
                          .user_message
                      }
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#9ca3af",
                          marginBottom: "4px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow:
                            "ellipsis",
                        }}
                      >
                        📄{" "}
                        {document
                          ? document.title
                          : "Document"}
                      </div>

                      <div
                        style={{
                          fontSize: "14px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow:
                            "ellipsis",
                        }}
                      >
                        {
                          conversation.latestChat
                            .user_message
                        }
                      </div>

                      {conversation.chats.length >
                        1 && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#9ca3af",
                            marginTop: "4px",
                          }}
                        >
                          {
                            conversation.chats
                              .length
                          }{" "}
                          messages
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() =>
                        handleDeleteConversation(
                          conversation
                        )
                      }
                      disabled={
                        deleteLoading ===
                        conversation.conversationKey
                      }
                      title="Delete conversation"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: "pointer",
                        padding: "6px",
                      }}
                    >
                      {deleteLoading ===
                      conversation.conversationKey
                        ? "..."
                        : "×"}
                    </button>
                  </div>
                );
              }
            )
          )}
        </div>

        {/* User / Logout */}
        <div
          style={{
            borderTop:
              "1px solid rgba(255,255,255,0.08)",
            padding: "15px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#9ca3af",
              marginBottom: "10px",
            }}
          >
            Signed in as User {userId}
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "7px",
              border:
                "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ======================================
          MAIN CONTENT
      ======================================= */}

      <main
        style={{
          flex: 1,
          height: "100vh",
          overflowY: "auto",
          background: "#ffffff",
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: "18px 30px",
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            background: "#ffffff",
            zIndex: 5,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
            }}
          >
            {selectedDocumentTitle ||
              "AI Research Workspace"}
          </h2>
        </header>

        <div
          style={{
            maxWidth: "950px",
            margin: "0 auto",
            padding: "30px",
          }}
        >
          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px",
                marginBottom: "20px",
                background: "#fff1f2",
                border:
                  "1px solid #fecdd3",
                borderRadius: "8px",
                color: "#9f1239",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div
              style={{
                padding: "12px",
                marginBottom: "20px",
                background: "#f0fdf4",
                border:
                  "1px solid #bbf7d0",
                borderRadius: "8px",
              }}
            >
              <strong>
                {successMessage}
              </strong>
            </div>
          )}

          {/* ==================================
              NEW CHAT / UPLOAD
          =================================== */}

          {!selectedChat &&
            !selectedDocumentId && (
              <section
                style={{
                  border:
                    "1px solid #e5e7eb",
                  borderRadius: "14px",
                  padding: "25px",
                  marginBottom: "25px",
                }}
              >
                <h2>
                  Start a New Research Chat
                </h2>

                <p>
                  Upload a PDF and start asking
                  questions about it.
                </p>

                <input
                  type="text"
                  placeholder="Document title"
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "12px",
                    boxSizing:
                      "border-box",
                    border:
                      "1px solid #d1d5db",
                    borderRadius: "8px",
                  }}
                />

                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) =>
                    setFile(
                      e.target.files[0]
                    )
                  }
                  style={{
                    marginBottom: "15px",
                  }}
                />

                <br />

                <button
                  onClick={handleUpload}
                  disabled={uploadLoading}
                  style={{
                    padding:
                      "11px 20px",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  {uploadLoading
                    ? "Processing..."
                    : "Upload PDF"}
                </button>
              </section>
            )}

          {/* ==================================
              DOCUMENT SUMMARY
          =================================== */}

          {selectedDocumentId && (
            <section
              style={{
                border:
                  "1px solid #e5e7eb",
                borderRadius: "14px",
                padding: "25px",
                marginBottom: "25px",
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "flex-start",
                  gap: "20px",
                }}
              >
                <div
                  style={{ flex: 1 }}
                >
                  <h2
                    style={{
                      marginTop: 0,
                    }}
                  >
                    AI Summary
                  </h2>

                  {summary ? (
                    <ReactMarkdown>
                      {summary}
                    </ReactMarkdown>
                  ) : (
                    <p>
                      No summary available.
                    </p>
                  )}
                </div>

                <button
                  onClick={handleOpenPdf}
                  disabled={pdfLoading}
                  style={{
                    padding:
                      "10px 16px",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {pdfLoading
                    ? "Opening..."
                    : "Open PDF"}
                </button>
              </div>
            </section>
          )}

          {/* ==================================
              SELECTED CHAT
          =================================== */}

          {selectedChat && (
            <section
              style={{
                marginBottom: "25px",
              }}
            >
              <div
                style={{
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Your question
                </div>

                <div
                  style={{
                    background: "#f3f4f6",
                    padding:
                      "14px 16px",
                    borderRadius: "12px",
                  }}
                >
                  {selectedChat.user_message}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  AI Response
                </div>

                <div
                  style={{
                    padding: "5px 0",
                    lineHeight: 1.7,
                  }}
                >
                  <ReactMarkdown>
                    {
                      selectedChat.assistant_response
                    }
                  </ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {/* ==================================
              ASK AI
          =================================== */}

          {selectedDocumentId && (
            <section
              style={{
                borderTop:
                  "1px solid #e5e7eb",
                paddingTop: "25px",
              }}
            >
              <h2>
                Ask AI About This Document
              </h2>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  placeholder="Ask a question about this document..."
                  value={question}
                  onChange={(e) =>
                    setQuestion(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !chatLoading
                    ) {
                      handleAskAI();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "13px",
                    border:
                      "1px solid #d1d5db",
                    borderRadius: "10px",
                    boxSizing:
                      "border-box",
                  }}
                />

                <button
                  onClick={handleAskAI}
                  disabled={chatLoading}
                  style={{
                    padding:
                      "13px 20px",
                    border: "none",
                    borderRadius: "10px",
                    cursor: "pointer",
                  }}
                >
                  {chatLoading
                    ? "Thinking..."
                    : "Ask"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;