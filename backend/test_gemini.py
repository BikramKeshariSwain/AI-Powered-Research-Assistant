from ai_service import generate_summary

text = """
Artificial Intelligence is transforming healthcare.
It helps doctors diagnose diseases earlier,
improves patient monitoring, and supports clinical decision-making.
"""

summary = generate_summary(text)

print("Summary:")
print(summary)