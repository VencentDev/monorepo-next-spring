import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TodosPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Todos</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Todo data and interactions are implemented in ticket 11.
        </p>
      </CardContent>
    </Card>
  );
}
