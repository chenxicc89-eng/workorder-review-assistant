import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import { Pencil, Check } from "lucide-react";

interface Props {
  opinion: string;
  /** 是否允许人工编辑(审核页允许;案例详情按需) */
  editable?: boolean;
  onChange?: (value: string) => void;
}

/** 审核意见卡片:展示可复制的正式意见,支持人工编辑 */
export function ReviewOpinionBox({ opinion, editable = true, onChange }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(opinion);

  React.useEffect(() => {
    setValue(opinion);
  }, [opinion]);

  const commit = () => {
    setEditing(false);
    onChange?.(value);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">审核意见</CardTitle>
        <div className="flex items-center gap-2">
          {editable &&
            (editing ? (
              <Button size="sm" variant="outline" onClick={commit}>
                <Check /> 完成编辑
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil /> 编辑
              </Button>
            ))}
          <CopyButton text={value} toastMessage="审核意见已复制" />
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <Textarea
            className="min-h-[140px] leading-relaxed"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-7">
            {value || "（暂无审核意见）"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
