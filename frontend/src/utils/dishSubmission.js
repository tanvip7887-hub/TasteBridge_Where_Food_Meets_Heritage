export const buildDishStoryPayload = ({
  whoTaught = "",
  occasion = "",
  culturalSignificance = "",
  storyText = "",
  visibility = "PUBLIC",
}) => {
  const teacher = whoTaught.trim();
  const occasionValue = occasion.trim();
  const significance = culturalSignificance.trim();
  const story = storyText.trim();
  const hasStoryInput = Boolean(teacher || occasionValue || significance || story);

  if (!hasStoryInput) return undefined;
  if (teacher.length < 2) {
    throw new Error("Please share who taught you this recipe before saving its story.");
  }
  if (story.length < 10) {
    throw new Error("A heritage story of at least 10 characters is required when story details are provided.");
  }

  return {
    whoTaught: teacher,
    occasion: occasionValue || null,
    culturalSignificance: significance || null,
    storyText: story,
    visibility,
  };
};
