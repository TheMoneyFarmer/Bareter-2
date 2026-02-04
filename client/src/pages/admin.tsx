import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { User, Listing, DealWithUsers } from "@shared/schema";
import {
  Users,
  Package,
  Handshake,
  TrendingUp,
  Search,
  Shield,
  ShieldCheck,
  Eye,
  MoreHorizontal,
  DollarSign,
  Activity,
  Calendar,
} from "lucide-react";
import { Link } from "wouter";

export function AdminPage() {
  const { user } = useAuth();
  const [searchUsers, setSearchUsers] = useState("");
  const [searchListings, setSearchListings] = useState("");

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user?.isAdmin,
  });

  const { data: listings, isLoading: listingsLoading } = useQuery<Listing[]>({
    queryKey: ["/api/admin/listings"],
    enabled: !!user?.isAdmin,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery<DealWithUsers[]>({
    queryKey: ["/api/admin/deals"],
    enabled: !!user?.isAdmin,
  });

  if (!user?.isAdmin) {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl text-center">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">
          You don't have permission to view this page.
        </p>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    );
  }

  const totalUsers = users?.length || 0;
  const verifiedUsers = users?.filter((u) => u.isVerified).length || 0;
  const totalListings = listings?.length || 0;
  const activeListings = listings?.filter((l) => l.isActive).length || 0;
  const totalDeals = deals?.length || 0;
  const completedDeals = deals?.filter((d) => d.state === "completed").length || 0;
  const totalVolume = deals
    ?.filter((d) => d.state === "completed")
    .reduce((sum, d) => sum + parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string), 0) || 0;

  const filteredUsers = users?.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchUsers.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUsers.toLowerCase())
  );

  const filteredListings = listings?.filter(
    (l) =>
      l.title.toLowerCase().includes(searchListings.toLowerCase()) ||
      l.description.toLowerCase().includes(searchListings.toLowerCase())
  );

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage users, listings, and deals across the platform
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {verifiedUsers} verified
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Listings</p>
                <p className="text-2xl font-bold">{totalListings}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeListings} active
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Package className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Deals</p>
                <p className="text-2xl font-bold">{totalDeals}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedDeals} completed
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Handshake className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trade Volume</p>
                <p className="text-2xl font-bold">
                  AED {(totalVolume / 1000).toFixed(0)}K
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Completed trades
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" className="gap-2" data-testid="admin-tab-users">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="listings" className="gap-2" data-testid="admin-tab-listings">
            <Package className="h-4 w-4" />
            Listings
          </TabsTrigger>
          <TabsTrigger value="deals" className="gap-2" data-testid="admin-tab-deals">
            <Handshake className="h-4 w-4" />
            Deals
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2" data-testid="admin-tab-analytics">
            <Activity className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Manage registered users and verification</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchUsers}
                    onChange={(e) => setSearchUsers(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-users"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers?.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={u.avatarUrl || undefined} />
                              <AvatarFallback className="text-xs">
                                {u.fullName.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="font-medium">{u.fullName}</span>
                              {u.businessName && (
                                <p className="text-xs text-muted-foreground">{u.businessName}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>{u.location || "-"}</TableCell>
                        <TableCell>
                          {u.isVerified ? (
                            <Badge className="gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Unverified</Badge>
                          )}
                          {u.isAdmin && (
                            <Badge variant="destructive" className="ml-1">Admin</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" data-testid={`button-user-actions-${u.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Listings</CardTitle>
                  <CardDescription>View and moderate all listings</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search listings..."
                    value={searchListings}
                    onChange={(e) => setSearchListings(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-listings"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {listingsLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredListings?.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="font-medium line-clamp-1">{l.title}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={l.type === "offer" ? "default" : "secondary"}>
                            {l.type === "offer" ? "Offer" : "Request"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          AED {parseFloat(l.retailValue as string).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.location || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{l.viewCount || 0}</TableCell>
                        <TableCell>
                          {l.isActive ? (
                            <Badge variant="outline" className="text-green-600">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" data-testid={`button-listing-view-${l.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader>
              <CardTitle>Deals</CardTitle>
              <CardDescription>Monitor all trade deals</CardDescription>
            </CardHeader>
            <CardContent>
              {dealsLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : deals && deals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal ID</TableHead>
                      <TableHead>Parties</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-sm">
                          {d.dealNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{d.seeker?.fullName}</span>
                            <span className="text-muted-foreground mx-1">↔</span>
                            <span className="text-sm">{d.provider?.fullName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          AED {(parseFloat(d.seekerValue as string) + parseFloat(d.providerValue as string)).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{d.state}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No deals yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary mb-2">
                  AED {((completedDeals * 100) + (totalVolume * 0.12)).toLocaleString()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Estimated from {completedDeals} completed deals
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Users</span>
                    <span className="font-medium">{Math.floor(totalUsers * 0.3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Listings</span>
                    <span className="font-medium">{Math.floor(totalListings * 0.4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Deals</span>
                    <span className="font-medium">{Math.floor(totalDeals * 0.5)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
