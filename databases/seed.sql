INSERT INTO users (name, email, password_hash)
VALUES
    ('Demo User', 'demo@example.com', 'replace_with_hashed_password'),
    ('Research Analyst', 'analyst@example.com', 'replace_with_hashed_password');

INSERT INTO documents (user_id, title, file_name, file_type, file_path, upload_status)
VALUES
    (1, 'AI in Healthcare Research Paper', 'ai_healthcare.pdf', 'pdf', '/uploads/ai_healthcare.pdf', 'processed'),
    (1, 'Market Intelligence Notes', 'market_notes.docx', 'docx', '/uploads/market_notes.docx', 'uploaded'),
    (2, 'Climate Policy Review', 'climate_policy.pdf', 'pdf', '/uploads/climate_policy.pdf', 'processed');

INSERT INTO summaries (document_id, summary_text, key_insights)
VALUES
    (
        1,
        'This document discusses major applications of artificial intelligence in healthcare research.',
        'AI can improve diagnosis, clinical workflows, and patient monitoring.'
    ),
    (
        3,
        'This document reviews climate policy trends and their social and economic implications.',
        'Policy outcomes depend on implementation quality, funding, and long-term regulatory support.'
    );

INSERT INTO chats (user_id, document_id, user_message, assistant_response)
VALUES
    (
        1,
        1,
        'What are the main findings in this healthcare AI paper?',
        'The paper highlights diagnosis support, workflow automation, and patient monitoring as key findings.'
    ),
    (
        2,
        3,
        'Summarize the policy risks from this document.',
        'The main risks include inconsistent implementation, insufficient funding, and unclear regulation.'
    );