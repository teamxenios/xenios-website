import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function WaitlistForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    toast({
      title: "You're on the list.",
      description: "We'll be in touch properly.",
    });
    form.reset();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full max-w-sm items-start space-x-2 mx-auto">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input 
                  placeholder="Enter your email" 
                  {...field} 
                  className="rounded-none border-border bg-transparent focus-visible:ring-0 focus-visible:border-primary h-12"
                />
              </FormControl>
              <FormMessage className="absolute mt-1" />
            </FormItem>
          )}
        />
        <Button type="submit" className="rounded-none h-12 px-8 font-medium">
          Join
        </Button>
      </form>
    </Form>
  );
}
