# General Behavior Tracking System - Examples

## How the New System Works

The application has been transformed from a simple sleep/mood/energy tracker into a comprehensive behavior change application that tracks daily routines, activities, and plans in natural language.

## Example Daily Check-ins

### Example 1: Comprehensive Check-in
**User Message:**
```
Yesterday I had a productive day - finished my presentation, went to the gym, and had dinner with friends. I felt energized and accomplished. Today I'm feeling motivated and want to focus on my coding project. I plan to work on the API integration, go for a run, and prepare for tomorrow's meeting. I'm a bit concerned about the tight deadline though.
```

**What the system extracts:**
- previous_day_activities: "finished presentation, went to gym, had dinner with friends"
- previous_day_highlights: "productive day, felt energized and accomplished"
- current_mood: "motivated"
- today_plans: "work on API integration, go for a run, prepare for meeting"
- concerns: "tight deadline"

### Example 2: Simple Reflection
**User Message:**
```
I didn't sleep well last night, maybe 5 hours. Feeling tired but I need to finish this project today. Yesterday I procrastinated too much and didn't get much done. Today I want to focus and be more productive.
```

**What the system extracts:**
- sleep_hours: 5
- sleep_quality: "didn't sleep well"
- current_energy_level: "tired"
- previous_day_challenges: "procrastinated too much, didn't get much done"
- today_goals: ["focus", "be more productive"]

### Example 3: Routine-focused Check-in
**User Message:**
```
My morning routine was good today - meditation, coffee, and a quick workout. Yesterday I skipped my workout and felt sluggish all day. Today I want to maintain this energy and tackle my most important tasks first.
```

**What the system extracts:**
- previous_day_routine: "skipped workout, felt sluggish"
- previous_day_challenges: "skipped workout, felt sluggish"
- current_energy_level: "good energy"
- today_priorities: ["tackle most important tasks first"]

## Key Features

1. **Natural Language Processing**: Users can express themselves naturally without rigid formats
2. **Comprehensive Tracking**: Captures activities, routines, mood, energy, plans, and concerns
3. **Pattern Recognition**: Analyzes trends across multiple days
4. **Goal Integration**: Connects daily activities to long-term goals
5. **Behavioral Insights**: Provides recommendations based on patterns
6. **Flexible Structure**: Adapts to different types of check-ins

## Backward Compatibility

The system still supports the old format:
```
Sleep 7h | Mood 8 | Energy 6 | Notes: Feeling good today
```

## Daily Plan Generation

The system now generates comprehensive daily plans that include:
1. **Previous Day Reflection**: Analysis of what they shared
2. **Today's Focus Areas**: Specific priorities based on their plans and goals
3. **Behavior Insights**: Patterns noticed and recommendations
4. **Goal Alignment**: How today connects to long-term goals
5. **Motivational Closing**: Encouragement and support

This creates a much more holistic and useful behavior change application!
