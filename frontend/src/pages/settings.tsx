import { useState } from "react";
import { toast } from "sonner";
import { useBoards, useCreateBoard, useDeleteBoard } from "@/hooks/use-workspace";
import { extensionApi, ExtensionToken, ExtensionTokenCreated } from "@/api/extension";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Copy, Key, Columns } from "lucide-react";

export default function SettingsPage() {
  const { data: boards = [] } = useBoards();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();

  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [newBoardName, setNewBoardName] = useState("");
  const [tokenLabel, setTokenLabel] = useState("");
  const [showToken, setShowToken] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<ExtensionTokenCreated | null>(null);

  const loadTokens = async () => {
    try {
      const data = await extensionApi.listTokens();
      setTokens(data);
    } catch {}
  };

  useState(() => {
    loadTokens();
  });

  const handleCreateToken = async () => {
    try {
      const data = await extensionApi.createToken(tokenLabel);
      setNewToken(data);
      setShowToken(data.token);
      setTokenLabel("");
      loadTokens();
      toast.success("Token created");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create token");
    }
  };

  const handleRevokeToken = async (id: string) => {
    try {
      await extensionApi.revokeToken(id);
      toast.success("Token revoked");
      loadTokens();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to revoke");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Columns className="h-5 w-5" /> Boards
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="New board name"
              maxLength={80}
            />
            <Button
              onClick={async () => {
                if (!newBoardName) return;
                await createBoard.mutateAsync(newBoardName);
                setNewBoardName("");
                toast.success("Board created");
              }}
              disabled={createBoard.isPending}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="space-y-1">
            {boards.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <span className="text-sm">{b.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => deleteBoard.mutate(b.id)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Chrome Extension Tokens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={tokenLabel}
              onChange={(e) => setTokenLabel(e.target.value)}
              placeholder="Token label (e.g. Laptop)"
            />
            <Button onClick={handleCreateToken}>
              <Plus className="mr-1 h-4 w-4" /> Create Token
            </Button>
          </div>

          {showToken && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Save this token now — it won't be shown again:
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="text-xs break-all bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded">
                  {showToken}
                </code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(showToken)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <div>
                  <span className="text-sm">{t.label || "Unnamed"}</span>
                  <span className="text-xs text-muted-foreground ml-2">{t.token_prefix}...</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleRevokeToken(t.id)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
