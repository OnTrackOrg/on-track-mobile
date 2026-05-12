import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../store";
import { useTheme } from "../contexts/ThemeContext";
import { haptics } from "../utils/haptics";
import { RootStackParamList } from "../navigation";
import LabeledTextField from "./LabeledTextField";

type NewGoalProps = NativeStackScreenProps<RootStackParamList, "NewGoal">;

export default function NewGoalScreen({ navigation }: NewGoalProps) {
  const addGoal = useStore((s) => s.addGoal);
  const [title, setTitle] = React.useState("");
  const [target, setTarget] = React.useState("");
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <View style={{ padding: 16, gap: 12 }}>
        <LabeledTextField
          label="Goal Title"
          placeholder="e.g., Fitness"
          value={title}
          onChangeText={setTitle}
        />

        <LabeledTextField
          label="Target (optional)"
          placeholder="e.g., 200 lbs, 10% BF"
          value={target}
          onChangeText={setTarget}
        />

        <Pressable
          onPress={() => {
            if (title.trim()) {
              void haptics.success();
              addGoal(title.trim(), target.trim() || undefined);
              navigation.goBack();
              return;
            }

            void haptics.error();
          }}
          style={{ backgroundColor: theme.primary, padding: 12, borderRadius: 10 }}
        >
          <Text
            style={{ color: "white", textAlign: "center", fontWeight: "700" }}
          >
            Create Goal
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
