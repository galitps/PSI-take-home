from schema import PSIAgentEvent

# Create a test instance with valid data
try:
    # Instantiating the event
    event = PSIAgentEvent(
        id="TEST",
        tokens={"prompt": 120, "completion": 45},
        payload={"action": "run_hypothesis_check"}
    )
    
    # 1. Test model instantiation
    print("✅ Model Created Successfully:")
    print(event)

    # 2. Test JSON dump serialization
    json_output = event.to_jsonl()
    print("\n✅ Generated JSON Output:")
    print(json_output)

except Exception as e:
    print(f"❌ Instantiation Failed: {e}")